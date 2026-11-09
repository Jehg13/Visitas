import { mkdir, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "./db";
import type { AuthenticatedUser } from "./auth";

const releaseDirectory = resolve(
  Bun.env.APP_RELEASES_DIR?.trim() ||
    fileURLToPath(new URL("../app-releases/", import.meta.url)),
);
const maxApkSize = 150 * 1024 * 1024;
const channels = ["phone", "tablet"] as const;
type MobileReleaseChannel = (typeof channels)[number];
type MobileReleaseRow = RowDataPacket & {
  id: number;
  channel: MobileReleaseChannel;
  version: string;
  build_number: number;
  notes: string;
  storage_filename: string;
  original_filename: string;
  file_size: number;
  sha256: string;
  created_by_login: string;
  created_at: Date;
};

function releaseIdFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/app-releases\/admin\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isReleaseChannel(value: FormDataEntryValue | string | null): value is MobileReleaseChannel {
  return typeof value === "string" && channels.some((channel) => channel === value);
}

function isValidVersion(value: FormDataEntryValue | string | null): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function releaseJson(release: MobileReleaseRow, isLatest = false) {
  return {
    id: Number(release.id),
    channel: release.channel,
    version: release.version,
    build: Number(release.build_number),
    notes: release.notes,
    filename: release.original_filename,
    size: Number(release.file_size),
    sha256: release.sha256,
    createdBy: release.created_by_login,
    createdAt: release.created_at,
    isLatest,
    downloadUrl: `/api/v1/app-releases/${Number(release.id)}/download`,
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function handleMobileAppReleaseRequest(
  request: Request,
  url: URL,
  getUser: (request: Request) => Promise<AuthenticatedUser | null>,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/api/app-releases/latest") {
    const channel = url.searchParams.get("channel");
    const currentBuild = Number(url.searchParams.get("build") ?? 0);
    if (!isReleaseChannel(channel) || !Number.isSafeInteger(currentBuild) || currentBuild < 0) {
      return jsonError("El canal o la versión instalada no son válidos.", 400);
    }

    try {
      const [rows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE channel = ?
         ORDER BY build_number DESC
         LIMIT 1`,
        [channel],
      );
      const release = rows[0];
      return Response.json({
        release: release ? releaseJson(release) : null,
        updateAvailable: Boolean(release && Number(release.build_number) > currentBuild),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("Failed to check the latest mobile app release:", error);
      return jsonError("No se pudo consultar la versión móvil.", 500);
    }
  }

  const downloadMatch = url.pathname.match(/^\/api\/app-releases\/(\d+)\/download$/);
  if (request.method === "GET" && downloadMatch) {
    try {
      const [rows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE id = ?
         LIMIT 1`,
        [Number(downloadMatch[1])],
      );
      const release = rows[0];
      if (!release) return jsonError("No se encontró el archivo de actualización.", 404);
      const file = Bun.file(join(releaseDirectory, release.storage_filename));
      if (!(await file.exists())) {
        console.error(`Mobile app release file is missing for release ${release.id}.`);
        return jsonError("El archivo de esta versión no está disponible.", 404);
      }
      return new Response(file.stream(), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="CyMEZ-Recepcion-${release.channel}-${release.version}.apk"`,
          "Content-Length": String(file.size),
          "Content-Type": "application/vnd.android.package-archive",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("Failed to download a mobile app release:", error);
      return jsonError("No se pudo descargar esta versión.", 500);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/app-releases/admin") {
    const user = await getUser(request);
    if (!user?.isAdmin) return jsonError("Se requiere acceso de administrador.", 403);
    try {
      const [rows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         ORDER BY created_at DESC, id DESC`,
      );
      const latestByChannel = new Map<string, number>();
      for (const release of rows) {
        const currentLatest = latestByChannel.get(release.channel);
        if (currentLatest === undefined || Number(release.build_number) > currentLatest) {
          latestByChannel.set(release.channel, Number(release.build_number));
        }
      }
      return Response.json({
        releases: rows.map((release) =>
          releaseJson(
            release,
            latestByChannel.get(release.channel) === Number(release.build_number),
          )
        ),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("Failed to list mobile app releases:", error);
      return jsonError("No se pudo cargar el historial de versiones.", 500);
    }
  }

  const adminReleaseId = releaseIdFromPath(url.pathname);
  if (adminReleaseId !== null && request.method === "PATCH") {
    const user = await getUser(request);
    if (!user?.isAdmin) return jsonError("Se requiere acceso de administrador.", 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.warn("Invalid JSON request for mobile app release notes:", error);
      return jsonError("La información de edición no tiene un formato válido.", 400);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("notes" in body) ||
      typeof body.notes !== "string" ||
      body.notes.trim().length > 2000
    ) {
      return jsonError("Las notas no pueden superar los 2,000 caracteres.", 400);
    }

    try {
      const [existingRows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE id = ?
         LIMIT 1`,
        [adminReleaseId],
      );
      if (!existingRows[0]) return jsonError("No se encontró la versión seleccionada.", 404);
      await pool.execute(
        "UPDATE mobile_app_releases SET notes = ? WHERE id = ?",
        [body.notes.trim(), adminReleaseId],
      );
      const [updatedRows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE id = ?
         LIMIT 1`,
        [adminReleaseId],
      );
      const [latestRows] = await pool.execute<RowDataPacket[]>(
        `SELECT build_number
         FROM mobile_app_releases
         WHERE channel = ?
         ORDER BY build_number DESC
         LIMIT 1`,
        [updatedRows[0].channel],
      );
      return Response.json({
        release: releaseJson(
          updatedRows[0],
          Number(latestRows[0]?.build_number) === Number(updatedRows[0].build_number),
        ),
      });
    } catch (error) {
      console.error("Failed to edit mobile app release notes:", error);
      return jsonError("No se pudieron guardar las notas de la versión.", 500);
    }
  }

  if (adminReleaseId !== null && request.method === "DELETE") {
    const user = await getUser(request);
    if (!user?.isAdmin) return jsonError("Se requiere acceso de administrador.", 403);

    const connection = await pool.getConnection();
    let storageFilename: string | null = null;
    try {
      await connection.beginTransaction();
      const [releaseRows] = await connection.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE id = ?
         FOR UPDATE`,
        [adminReleaseId],
      );
      const release = releaseRows[0];
      if (!release) {
        await connection.rollback();
        return jsonError("No se encontró la versión seleccionada.", 404);
      }

      const [latestRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM mobile_app_releases
         WHERE channel = ?
         ORDER BY build_number DESC
         LIMIT 1
         FOR UPDATE`,
        [release.channel],
      );
      if (Number(latestRows[0]?.id) === Number(release.id)) {
        await connection.rollback();
        return jsonError(
          "No se puede eliminar la versión activa del canal. Publica una compilación más reciente primero.",
          409,
        );
      }

      await connection.execute(
        "DELETE FROM mobile_app_releases WHERE id = ?",
        [adminReleaseId],
      );
      storageFilename = release.storage_filename;
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Failed to delete a mobile app release:", error);
      return jsonError("No se pudo eliminar la versión seleccionada.", 500);
    } finally {
      connection.release();
    }

    let fileCleanupWarning = false;
    if (storageFilename) {
      try {
        await unlink(join(releaseDirectory, storageFilename));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          fileCleanupWarning = true;
          console.error("Failed to remove a deleted mobile app release file:", error);
        }
      }
    }
    return Response.json({
      message: fileCleanupWarning
        ? "La versión se eliminó, pero el archivo no pudo limpiarse del almacenamiento."
        : "La versión se eliminó.",
      fileCleanupWarning,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/app-releases/admin") {
    const user = await getUser(request);
    if (!user?.isAdmin) return jsonError("Se requiere acceso de administrador.", 403);

    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      console.warn("Invalid multipart request for a mobile app release:", error);
      return jsonError("El formulario de publicación no tiene un formato válido.", 400);
    }
    const channel = form.get("channel");
    const version = form.get("version");
    const build = Number(form.get("build"));
    const notes = form.get("notes");
    const apk = form.get("apk");
    if (
      !isReleaseChannel(channel) ||
      !isValidVersion(version) ||
      !Number.isSafeInteger(build) ||
      build <= 0 ||
      build > 2_147_483_647 ||
      typeof notes !== "string" ||
      notes.trim().length > 2000 ||
      !(apk instanceof File) ||
      !apk.name.toLocaleLowerCase("en").endsWith(".apk") ||
      apk.size <= 0 ||
      apk.size > maxApkSize
    ) {
      return jsonError(
        "Revisa el canal, la versión, el número de compilación, las notas y el APK (máximo 150 MB).",
        400,
      );
    }

    let storageFilename: string | null = null;
    try {
      const [latestRows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE channel = ?
         ORDER BY build_number DESC
         LIMIT 1`,
        [channel],
      );
      const latest = latestRows[0];
      if (latest && build <= Number(latest.build_number)) {
        return jsonError(
          `El número de compilación debe ser mayor que el último publicado (${latest.build_number}) para este canal.`,
          409,
        );
      }

      const bytes = Buffer.from(await apk.arrayBuffer());
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        return jsonError("El archivo seleccionado no parece ser un APK válido.", 400);
      }
      const checksum = createHash("sha256").update(bytes).digest("hex");
      storageFilename = `${channel}-${build}-${randomBytes(12).toString("hex")}.apk`;
      await mkdir(releaseDirectory, { recursive: true });
      await Bun.write(join(releaseDirectory, storageFilename), bytes);

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO mobile_app_releases
           (channel, version, build_number, notes, original_filename,
            storage_filename, file_size, sha256, created_by_login)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          channel,
          version,
          build,
          notes.trim(),
          apk.name.slice(0, 255),
          storageFilename,
          bytes.length,
          checksum,
          user.login,
        ],
      );
      const [releaseRows] = await pool.execute<MobileReleaseRow[]>(
        `SELECT id, channel, version, build_number, notes, storage_filename,
                original_filename, file_size, sha256, created_by_login, created_at
         FROM mobile_app_releases
         WHERE id = ?
         LIMIT 1`,
        [result.insertId],
      );
      const release = releaseRows[0];
      if (!release) throw new Error("The new mobile app release could not be loaded.");
      return Response.json({ release: releaseJson(release) }, { status: 201 });
    } catch (error) {
      if (storageFilename) {
        try {
          await unlink(join(releaseDirectory, storageFilename));
        } catch (cleanupError) {
          console.error("Failed to remove an unregistered mobile app release file:", cleanupError);
        }
      }
      console.error("Failed to publish a mobile app release:", error);
      return jsonError("No se pudo publicar la versión móvil.", 500);
    }
  }

  return null;
}

export function isPublicMobileAppReleaseRequest(request: Request, url: URL) {
  return (
    (request.method === "GET" && url.pathname === "/api/app-releases/latest") ||
    (request.method === "GET" && /^\/api\/app-releases\/\d+\/download$/.test(url.pathname))
  );
}
