export type AppointmentStatus = "Dentro" | "En proceso" | "Pendiente" | "Retirado" | "Cancelada";
export type BusinessPartnerType = "Contratista" | "Proveedor" | "Visitante";
export type BusinessPartnerStatus = "Activa" | "Inactiva" | "No aplica";
export type ExternalStaffType = "Contratista" | "Proveedor";
export type SectionAccess = "recepcion" | "anfitriones" | "administrador";
export type SystemAccessRole = "Administrador" | "Recepción" | "Anfitriones";
export type CompanyApplicationRole =
  | "administrador_empresa"
  | "recepcion"
  | "anfitrion"
  | "sin_acceso";

export type Appointment = {
  id: number;
  businessPartnerId?: number | null;
  visitorRecordId?: number | null;
  date: string;
  time: string;
  visitor: string;
  email: string;
  referenceCode: string;
  registeredBy: string;
  company: string;
  tenantCompanyName?: string;
  partnerType?: BusinessPartnerType;
  host: string;
  status: AppointmentStatus;
  equipmentChecklistRequired?: boolean;
  equipmentEntryChecklistComplete?: boolean;
};

export type ExternalStaff = {
  id: number;
  businessPartnerId: number;
  fullName: string;
  phone: string;
  email: string;
  relationshipType: ExternalStaffType;
  companyName: string;
};

export type Department = {
  id: number;
  companyId: number;
  name: string;
  hostCount?: number;
};

export type Company = {
  id: number;
  name: string;
  departmentCount: number;
};

export type Host = {
  id: number;
  login: string;
  name: string;
  departmentId: number;
  role: string;
  email: string;
  phone: string;
  accessRoles: SystemAccessRole[];
};

export type HostAccountOption = {
  login: string;
  name: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
};

export type AccessAccount = {
  login: string;
  name: string | null;
  email: string | null;
  active: string | null;
  role: string | null;
  phone: string | null;
  sectionAccess: SectionAccess[];
};

export type Administrator = {
  login: string;
  name: string | null;
  email: string | null;
  active: string;
  applicationRole: CompanyApplicationRole;
  role: string | null;
  phone: string | null;
  companyId: number;
  companyName: string;
  mustChangePassword: boolean;
};

export type CompanyUser = {
  login: string;
  name: string | null;
  email: string | null;
  active: string;
  applicationRole: "recepcion" | "anfitrion";
  role: string | null;
  phone: string | null;
  companyId: number;
  departmentId: number | null;
  departmentName: string | null;
  mustChangePassword: boolean;
};

export type AuthenticatedUser = {
  login: string;
  name: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  isCompanyAdmin: boolean;
  companyId: number | null;
  companyRole: Exclude<CompanyApplicationRole, "sin_acceso"> | null;
  mustChangePassword: boolean;
  sectionAccess: SectionAccess[];
};

export type BusinessPartner = {
  id: number;
  name: string;
  description: string;
  rfc: string;
  category: string;
  subject: string;
  employeeCount: number;
  type: BusinessPartnerType;
  status: BusinessPartnerStatus;
  registeredBy: string;
  registeredByLogin?: string | null;
};

export type GeneralVisitor = {
  id: number;
  fullName: string;
  curp: string;
  phone: string;
  email: string;
};
