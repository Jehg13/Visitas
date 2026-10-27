export const dashboardSectionPaths = {
  Inicio: "/inicio",
  "Agenda de citas": "/agenda",
  Anfitriones: "/anfitriones",
  Accesos: "/accesos",
  Departamento: "/departamentos",
  "Personal de externos": "/personal-externo",
  "Contratistas, proveedores y visitantes": "/empresas",
  "Equipo y herramientas": "/equipos",
  "Bitácora diaria": "/bitacora",
} as const;

export type DashboardSection = keyof typeof dashboardSectionPaths;

export function dashboardSectionForPath(path: string): DashboardSection | null {
  const section = Object.entries(dashboardSectionPaths).find(([, sectionPath]) => sectionPath === path);
  return section ? section[0] as DashboardSection : null;
}
