// Modelo de especialización con información de verificación
export interface Specialization {
  name: string;
  verified: boolean;
  source: 'AI_VALIDATION' | 'MANUAL';
  verifiedAt: string | null;
  documentUrl: string | null;
}

// DTOs para las respuestas del backend
export interface UploadCredentialsResponse {
  totalFiles: number;
  uploaded: number;
  validated: number;
  rejected: number;
  savedCredentials: string[];
  details: UploadDetailItem[];
}

export interface UploadDetailItem {
  fileName: string;
  uploadedUrl: string;
  uploaded: boolean;
  saved: boolean;
  status: 'accepted' | 'rejected';
  addedSpecialization?: string; // Nueva especialización añadida
  reason?: string;
  validation?: {
    esDocumentoAcademico: boolean;
    especialidad?: string; // Campo nuevo de n8n
    tipoDocumento?: string;
    nivel?: string;
  };
}

export interface DeleteCredentialsResponse {
  removedCount: number;
  remainingCredentials: string[];
  tutorVerified: boolean;
  removedSpecializations: string[]; // Nuevo campo
  deletedFromAzure: number;
}
