import { createHash, randomInt } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import type { AuthenticatedUser } from "./auth";

const pairingCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairingCodeLifetimeMinutes = 10;

type PairingCodeStatus = "active" | "redeemed" | "expired" | "revoked";

type PairingCodeRow = RowDataPacket & {
  id: number;
  company_id: number;
  company_name: string;
  created_by_login: string;
  created_at: string;
  expires_at: string;
  status: PairingCodeStatus;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonNoStore(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function generateTabletPairingCode() {
  const code = Array.from({ length: 10 }, () =>
    pairingCodeAlphabet[randomInt(pairingCodeAlphabet.length)]
  ).join("");
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function hashTabletPairingCode(code: string) {
  return createHash("sha256")
    .update(code.replace(/-/g, "").toUpperCase())
    .digest("hex");
}

export async function handleTabletPairingRequest(
  request: Request,
  url: URL,
  getUser: (request: Request) => Promise<AuthenticatedUser | null>,
): Promise<Response | null> {
  const pairingCodeId = url.pathname.match(/^\/api\/tablet-pairing-codes\/(\d+)$/);
  if (
    url.pathname !== "/api/tablet-pairing-codes" &&
    !(request.method === "DELETE" && pairingCodeId)
  ) {
    return null;
  }

  const user = await getUser(request);
  if (!user?.isAdmin) {
    return jsonError("Se requiere acceso de administrador global.", 403);
  }

  if (request.method === "GET" && url.pathname === "/api/tablet-pairing-codes") {
    try {
      const [rows] = await pool.query<PairingCodeRow[]>(
        `SELECT pairing.id, pairing.company_id, companies.name AS company_name,
                pairing.created_by_login,
                DATE_FORMAT(pairing.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                DATE_FORMAT(pairing.expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at,
                CASE
                  WHEN pairing.redeemed_at IS NOT NULL THEN 'redeemed'
                  WHEN pairing.revoked_at IS NOT NULL THEN 'revoked'
                  WHEN pairing.expires_at <= UTC_TIMESTAMP() THEN 'expired'
                  ELSE 'active'
                END AS status
         FROM visitor_kiosk_pairing_codes pairing
         INNER JOIN companies ON companies.id = pairing.company_id
         ORDER BY pairing.id DESC
         LIMIT 100`,
      );
      return jsonNoStore({
        codes: rows.map((row) => ({
          id: Number(row.id),
          companyId: Number(row.company_id),
          companyName: row.company_name,
          createdBy: row.created_by_login,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          status: row.status,
        })),
      });
    } catch (error) {
      console.error("Failed to list tablet pairing codes:", error);
      return jsonError("No se pudieron cargar los códigos de vinculación.", 500);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/tablet-pairing-codes") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("La solicitud no tiene un formato válido.", 400);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("companyId" in body) ||
      typeof body.companyId !== "number" ||
      !Number.isSafeInteger(body.companyId) ||
      body.companyId < 1
    ) {
      return jsonError("Selecciona una empresa válida.", 400);
    }

    try {
      const [companies] = await pool.execute<RowDataPacket[]>(
        "SELECT id, name FROM companies WHERE id = ? LIMIT 1",
        [body.companyId],
      );
      const company = companies[0];
      if (!company) return jsonError("La empresa seleccionada no existe.", 404);

      const code = generateTabletPairingCode();
      const [insertResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO visitor_kiosk_pairing_codes
           (company_id, code_hash, created_by_login, expires_at)
         VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
        [
          body.companyId,
          hashTabletPairingCode(code),
          user.login,
          pairingCodeLifetimeMinutes,
        ],
      );
      const [expiryRows] = await pool.execute<RowDataPacket[]>(
        `SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at
         FROM visitor_kiosk_pairing_codes
         WHERE id = ?
         LIMIT 1`,
        [insertResult.insertId],
      );
      if (!expiryRows[0]) {
        throw new Error("The generated tablet pairing code could not be loaded.");
      }

      return jsonNoStore({
        code,
        pairingCode: {
          id: Number(insertResult.insertId),
          companyId: Number(company.id),
          companyName: company.name,
          expiresAt: expiryRows[0].expires_at,
        },
      }, 201);
    } catch (error) {
      console.error("Failed to create a tablet pairing code:", error);
      return jsonError("No se pudo generar el código de vinculación.", 500);
    }
  }

  if (request.method === "DELETE" && pairingCodeId) {
    const id = Number(pairingCodeId[1]);
    if (!Number.isSafeInteger(id) || id < 1) {
      return jsonError("El código seleccionado no es válido.", 400);
    }
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE visitor_kiosk_pairing_codes
         SET revoked_at = UTC_TIMESTAMP()
         WHERE id = ?
           AND redeemed_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > UTC_TIMESTAMP()`,
        [id],
      );
      if (result.affectedRows > 0) {
        return jsonNoStore({ message: "El código se revocó." });
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT redeemed_at, revoked_at, expires_at <= UTC_TIMESTAMP() AS expired
         FROM visitor_kiosk_pairing_codes
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      const pairingCode = rows[0];
      if (!pairingCode) return jsonError("No se encontró el código.", 404);
      if (pairingCode.redeemed_at) {
        return jsonError("El código ya se utilizó y no se puede revocar.", 409);
      }
      if (pairingCode.revoked_at) {
        return jsonNoStore({ message: "El código ya estaba revocado." });
      }
      if (pairingCode.expired) {
        return jsonError("El código ya venció.", 409);
      }
      return jsonError("No se pudo revocar el código.", 409);
    } catch (error) {
      console.error("Failed to revoke a tablet pairing code:", error);
      return jsonError("No se pudo revocar el código de vinculación.", 500);
    }
  }

  return jsonError("La operación de códigos de vinculación no es válida.", 405);
}
