import { createHash, randomInt } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import type { AuthenticatedUser } from "./auth";

const pairingCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairingCodeLifetimeMinutes = 10;
const pairingAttemptLimit = 8;
const pairingAttemptWindowMs = 15 * 60 * 1000;
const pairingAttemptsByAddress = new Map<string, { count: number; resetAt: number }>();

type PairingCodeStatus = "active" | "redeemed" | "expired" | "revoked";
export type TabletDevice = {
  id: number;
  companyId: number;
  companyName: string;
  deviceName: string;
};
export type TabletDeviceAuthentication =
  | { tokenProvided: false; device: null }
  | { tokenProvided: true; device: TabletDevice | null };

type PairingCodeRow = RowDataPacket & {
  id: number;
  company_id: number;
  company_name: string;
  created_by_login: string;
  created_at: string;
  expires_at: string;
  device_name: string | null;
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

function hashTabletDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function consumePairingAttempt(address: string) {
  const now = Date.now();
  for (const [key, attempt] of pairingAttemptsByAddress) {
    if (attempt.resetAt <= now) pairingAttemptsByAddress.delete(key);
  }
  const current = pairingAttemptsByAddress.get(address);
  if (current && current.resetAt > now && current.count >= pairingAttemptLimit) {
    return false;
  }
  pairingAttemptsByAddress.set(address, {
    count: current && current.resetAt > now ? current.count + 1 : 1,
    resetAt: current && current.resetAt > now
      ? current.resetAt
      : now + pairingAttemptWindowMs,
  });
  return true;
}

async function redeemTabletPairingCode(
  request: Request,
  sourceAddress: string,
): Promise<Response> {
  if (!consumePairingAttempt(sourceAddress)) {
    return jsonError("Se hicieron demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("La solicitud no tiene un formato válido.", 400);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("code" in body) ||
    typeof body.code !== "string" ||
    !("deviceToken" in body) ||
    typeof body.deviceToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(body.deviceToken)
  ) {
    return jsonError("La solicitud de vinculación no es válida.", 400);
  }
  const normalizedCode = body.code.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(normalizedCode)) {
    return jsonError("El código no es válido, venció o ya fue utilizado.", 400);
  }
  const deviceName = "deviceName" in body && typeof body.deviceName === "string"
    ? body.deviceName.trim().slice(0, 120)
    : "";
  const token = body.deviceToken;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingDevices] = await connection.execute<RowDataPacket[]>(
      `SELECT device.id, device.company_id, device.device_name, device.revoked_at,
              companies.name AS company_name
       FROM visitor_kiosk_devices device
       INNER JOIN companies ON companies.id = device.company_id
       WHERE device.token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [hashTabletDeviceToken(token)],
    );
    const existingDevice = existingDevices[0];
    if (existingDevice) {
      if (existingDevice.revoked_at) {
        await connection.rollback();
        return jsonError("La vinculación de esta tablet ya fue revocada.", 409);
      }
      await connection.commit();
      return jsonNoStore({
        token,
        company: {
          id: Number(existingDevice.company_id),
          name: existingDevice.company_name,
        },
        deviceId: Number(existingDevice.id),
        deviceName: existingDevice.device_name,
      }, 200);
    }

    const [pairingCodes] = await connection.execute<RowDataPacket[]>(
      `SELECT pairing.id, pairing.company_id, companies.name AS company_name
       FROM visitor_kiosk_pairing_codes pairing
       INNER JOIN companies ON companies.id = pairing.company_id
       WHERE pairing.code_hash = ?
         AND pairing.redeemed_at IS NULL
         AND pairing.revoked_at IS NULL
         AND pairing.expires_at > UTC_TIMESTAMP()
       LIMIT 1
       FOR UPDATE`,
      [hashTabletPairingCode(normalizedCode)],
    );
    const pairingCode = pairingCodes[0];
    if (!pairingCode) {
      await connection.rollback();
      return jsonError("El código no es válido, venció o ya fue utilizado.", 400);
    }

    const [deviceResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO visitor_kiosk_devices
         (company_id, pairing_code_id, device_name, token_hash)
       VALUES (?, ?, ?, ?)`,
      [
        Number(pairingCode.company_id),
        Number(pairingCode.id),
        deviceName || "Tablet de visitas sin cita",
        hashTabletDeviceToken(token),
      ],
    );
    await connection.execute(
      `UPDATE visitor_kiosk_pairing_codes
       SET redeemed_at = UTC_TIMESTAMP()
       WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL`,
      [Number(pairingCode.id)],
    );
    await connection.commit();
    return jsonNoStore({
      token,
      company: {
        id: Number(pairingCode.company_id),
        name: pairingCode.company_name,
      },
      deviceId: Number(deviceResult.insertId),
      deviceName: deviceName || "Tablet de visitas sin cita",
    }, 201);
  } catch (error) {
    await connection.rollback();
    console.error("Failed to redeem a tablet pairing code:", error);
    return jsonError("No se pudo vincular la tablet. Inténtalo de nuevo.", 500);
  } finally {
    connection.release();
  }
}

export async function authenticateTabletDevice(
  request: Request,
): Promise<TabletDeviceAuthentication> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/);
  if (!match) {
    return {
      tokenProvided: authorization.length > 0,
      device: null,
    };
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT device.id, device.company_id, device.device_name,
            companies.name AS company_name
     FROM visitor_kiosk_devices device
     INNER JOIN companies ON companies.id = device.company_id
     WHERE device.token_hash = ? AND device.revoked_at IS NULL
     LIMIT 1`,
    [hashTabletDeviceToken(match[1])],
  );
  const row = rows[0];
  if (!row) return { tokenProvided: true, device: null };
  await pool.execute(
    `UPDATE visitor_kiosk_devices
     SET last_seen_at = UTC_TIMESTAMP()
     WHERE id = ? AND revoked_at IS NULL`,
    [Number(row.id)],
  );
  return {
    tokenProvided: true,
    device: {
      id: Number(row.id),
      companyId: Number(row.company_id),
      companyName: row.company_name,
      deviceName: row.device_name,
    },
  };
}

export async function handleTabletPairingRequest(
  request: Request,
  url: URL,
  getUser: (request: Request) => Promise<AuthenticatedUser | null>,
  sourceAddress = "unknown",
): Promise<Response | null> {
  if (
    request.method === "POST" &&
    url.pathname === "/api/tablet-pairing-codes/redeem"
  ) {
    return redeemTabletPairingCode(request, sourceAddress);
  }
  const pairingCodeId = url.pathname.match(
    /^\/api\/tablet-pairing-codes\/(\d+)(\/revoke)?$/,
  );
  const isRevocationRequest =
    request.method === "POST" && pairingCodeId?.[2] === "/revoke";
  const isDeletionRequest =
    request.method === "DELETE" && pairingCodeId !== null && pairingCodeId[2] === undefined;
  if (
    url.pathname !== "/api/tablet-pairing-codes" &&
    !pairingCodeId
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
                device.device_name AS device_name,
                CASE
                  WHEN pairing.redeemed_at IS NOT NULL THEN 'redeemed'
                  WHEN pairing.revoked_at IS NOT NULL THEN 'revoked'
                  WHEN pairing.expires_at <= UTC_TIMESTAMP() THEN 'expired'
                  ELSE 'active'
                END AS status
         FROM visitor_kiosk_pairing_codes pairing
         INNER JOIN companies ON companies.id = pairing.company_id
         LEFT JOIN visitor_kiosk_devices device
           ON device.pairing_code_id = pairing.id
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
          deviceName: row.device_name,
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

  if (isDeletionRequest && pairingCodeId) {
    const id = Number(pairingCodeId[1]);
    if (!Number.isSafeInteger(id) || id < 1) {
      return jsonError("El código seleccionado no es válido.", 400);
    }
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        "DELETE FROM visitor_kiosk_pairing_codes WHERE id = ?",
        [id],
      );
      if (result.affectedRows === 0) {
        return jsonError("No se encontró el código.", 404);
      }
      return jsonNoStore({ message: "El código se eliminó del historial." });
    } catch (error) {
      console.error("Failed to delete a tablet pairing code:", error);
      return jsonError("No se pudo eliminar el código de vinculación.", 500);
    }
  }

  if (isRevocationRequest && pairingCodeId) {
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
