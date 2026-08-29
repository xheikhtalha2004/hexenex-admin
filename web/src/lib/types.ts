export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}
