export interface UploadedFileMetadata {
  name: string;
  documentType: string;
  cid: string;
}

export interface S3FileMetadata {
  s3Url: string;
  fileName: string;
  mimeType: string;
}

export interface PropertyDocumentsMetadata {
  propertyId: string;
  documents: UploadedFileMetadata[];
  timestamp: string;
}
