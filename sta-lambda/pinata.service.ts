import pinataSDK from "@pinata/sdk";
import { Readable } from "stream";
import axios from "axios";

export interface UploadedFileMetadata {
  name: string;
  documentType: string;
  cid: string;
}

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  stream: Readable;
  destination: string;
  filename: string;
  path: string;
}

export interface PropertyDocumentsMetadata {
  propertyId: string;
  propertyOwnerName: string;
  propertyType: string;
  propertyName: string;
  documents: UploadedFileMetadata[];
  timestamp: string;
}

export class PinataService {
  private pinata: any;

  constructor() {
    // Validate environment variables
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY) {
      throw new Error("Pinata API keys are not configured");
    }

    try {
      // Pinata SDK v1.0.0 can be imported as default or named export
      const PinataClient = (pinataSDK as any).default || pinataSDK;
      this.pinata = new PinataClient({
        pinataApiKey: process.env.PINATA_API_KEY,
        pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY,
      });
      console.log("Pinata client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Pinata client:", error);
      throw new Error("Failed to initialize Pinata client");
    }
  }

  private isPinataFileLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    const errorString = JSON.stringify(error).toLowerCase();

    const limitErrorPatterns = [
      "maximum number of pins",
      "pin limit",
      "reached the maximum",
      "too many pins",
      "pin quota",
      "exceeded.*pin",
      "429",
    ];

    return limitErrorPatterns.some(
      pattern =>
        errorMessage.toLowerCase().includes(pattern.toLowerCase()) ||
        errorString.includes(pattern.toLowerCase())
    );
  }

  async uploadFile(file: MulterFile): Promise<string> {
    try {
      console.log(
        `Uploading file to Pinata: ${file.originalname}, size: ${file.size} bytes, mimeType: ${file.mimetype}`
      );

      // Pinata SDK v1.0.0 expects a readable stream
      // Create stream from buffer
      const readableStream = Readable.from(file.buffer);

      // Pinata SDK may need the stream to have a path property for proper file identification
      // This helps Pinata SDK identify the file name
      Object.defineProperty(readableStream, "path", {
        value: file.originalname,
        writable: false,
        enumerable: true,
      });

      // Match the format used in sta-api (which works)
      const options = {
        pinataMetadata: {
          name: file.originalname,
        },
      };

      console.log(`Calling Pinata pinFileToIPFS`);
      console.log(
        `File details: name=${file.originalname}, size=${file.size}, mimeType=${file.mimetype}`
      );
      console.log(`Stream has path: ${!!(readableStream as any).path}`);

      // Call Pinata SDK - it expects stream as first parameter
      const result = await this.pinata.pinFileToIPFS(readableStream, options);

      console.log(
        `Pinata upload successful. Result:`,
        JSON.stringify(result, null, 2)
      );

      if (!result || !result.IpfsHash) {
        throw new Error(
          `Pinata returned invalid response: ${JSON.stringify(result)}`
        );
      }

      return result.IpfsHash;
    } catch (error) {
      console.error("Pinata upload error:", error);

      if (this.isPinataFileLimitError(error)) {
        throw new Error(
          "Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue."
        );
      }

      // Log detailed error information
      if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
        console.error(`Error stack: ${error.stack}`);
      }

      // Check if it's a Pinata API error with response details
      if ((error as any)?.response) {
        const pinataError = error as any;
        console.error(`Pinata API error response:`, {
          status: pinataError.response?.status,
          statusText: pinataError.response?.statusText,
          data: pinataError.response?.data,
          headers: pinataError.response?.headers,
        });

        if (pinataError.response?.data) {
          const errorData =
            typeof pinataError.response.data === "string"
              ? pinataError.response.data
              : JSON.stringify(pinataError.response.data);
          throw new Error(`Pinata API error: ${errorData}`);
        }
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      throw new Error(`Failed to upload file to IPFS: ${errorMessage}`);
    }
  }

  async uploadMetadata(metadata: PropertyDocumentsMetadata): Promise<string> {
    try {
      const options = {
        pinataMetadata: {
          name: `metadata-${metadata.propertyId}-${Date.now()}`,
        },
      };

      const result = await this.pinata.pinJSONToIPFS(metadata, options);
      return result.IpfsHash;
    } catch (error) {
      console.error("Pinata metadata upload error:", error);

      if (this.isPinataFileLimitError(error)) {
        throw new Error(
          "Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue."
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to upload metadata to IPFS: ${errorMessage}`);
    }
  }

  async uploadFileFromS3Url(s3Url: string): Promise<UploadedFileMetadata> {
    try {
      console.log(`Downloading file from S3 URL: ${s3Url}`);

      // Encode URL to handle special characters in filenames
      // Only encode the filename part, not the entire path to avoid double encoding
      // URL.toString() will encode again, so we manually construct the URL
      let encodedUrl = s3Url;
      try {
        const url = new URL(s3Url);
        const pathParts = url.pathname.split("/");
        // Only encode the last part (filename), keep path segments as-is
        if (pathParts.length > 0) {
          const filename = pathParts[pathParts.length - 1];
          // Decode first in case it's already encoded, then encode properly
          const decodedFilename = decodeURIComponent(filename);
          const encodedFilename = encodeURIComponent(decodedFilename);
          pathParts[pathParts.length - 1] = encodedFilename;
          // Manually construct URL to avoid double encoding by URL.toString()
          encodedUrl = `${url.origin}${pathParts.join("/")}`;
        }
      } catch (error) {
        // If URL parsing fails, use original URL
        console.warn(`URL parsing failed, using original: ${error}`);
      }

      console.log(`Encoded S3 URL: ${encodedUrl}`);

      // Download file from S3 URL
      // Increased timeout to 120 seconds (2 minutes) to handle large files
      // Lambda timeout is 300 seconds, so we have buffer for processing
      let response;
      try {
        response = await axios.get(encodedUrl, {
          responseType: "arraybuffer",
          timeout: 120000, // 120 seconds (2 minutes) timeout for large files
          maxRedirects: 5,
        });
      } catch (axiosError: any) {
        const status = axiosError?.response?.status;
        const statusText = axiosError?.response?.statusText;
        const errorMsg = axiosError?.message || "Unknown error";

        console.error(`Axios error details:`, {
          status,
          statusText,
          message: errorMsg,
          url: encodedUrl,
          originalUrl: s3Url,
        });

        if (status === 404) {
          throw new Error(
            `File not found at S3 URL: ${s3Url}. Status: ${status} ${statusText}`
          );
        }
        if (status === 403) {
          throw new Error(
            `Access denied to S3 URL: ${s3Url}. Status: ${status} ${statusText}. Check S3 bucket permissions or IAM role.`
          );
        }
        // Check for timeout errors specifically
        if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
          throw new Error(
            `Timeout downloading file from S3 URL: ${s3Url}. The file may be too large or network is slow. Consider checking file size (max 10MB) or S3 bucket accessibility.`
          );
        }
        if (status) {
          throw new Error(
            `HTTP ${status} ${statusText} when downloading from S3 URL: ${s3Url}. Error: ${errorMsg}`
          );
        }
        throw new Error(
          `Failed to download from S3 URL: ${s3Url}. Error: ${errorMsg}`
        );
      }

      // Extract filename from URL
      const urlParts = s3Url.split("/");
      let fileName = urlParts[urlParts.length - 1];

      // Remove query parameters if any
      if (fileName.includes("?")) {
        fileName = fileName.split("?")[0];
      }

      // Extract file extension and determine MIME type
      const fileExtension = fileName.split(".").pop()?.toLowerCase();
      let mimeType = "application/octet-stream";

      // Map property-related file extensions to MIME types
      const mimeTypeMap: { [key: string]: string } = {
        // Property Documents
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        // Property Images
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",

        // Property Data
        json: "application/json",
        txt: "text/plain",
        csv: "text/csv",

        // Excel Files
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        // Presentation Files
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };

      if (fileExtension && mimeTypeMap[fileExtension]) {
        mimeType = mimeTypeMap[fileExtension];
      } else {
        throw new Error(
          `Unsupported file type: ${fileExtension}. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX, PPT, PPTX are allowed for property documents.`
        );
      }

      // Create a buffer from the downloaded data
      const fileBuffer = Buffer.from(response.data as ArrayBuffer);

      // File size validation - 10MB limit
      const maxFileSize = 10 * 1024 * 1024;
      if (fileBuffer.length > maxFileSize) {
        throw new Error(
          `File ${fileName} exceeds 10MB limit. Size: ${fileBuffer.length} bytes`
        );
      }

      // Create a mock file object similar to Express.Multer.File
      const mockFile: MulterFile = {
        fieldname: "file",
        originalname: fileName,
        encoding: "7bit",
        mimetype: mimeType,
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: Readable.from(fileBuffer),
        destination: "",
        filename: fileName,
        path: "",
      };

      // Upload to IPFS using existing method
      const cid = await this.uploadFile(mockFile);

      return {
        name: fileName,
        documentType: mimeType,
        cid,
      };
    } catch (error) {
      console.error(`Failed to upload file from S3 URL ${s3Url}:`, error);

      if (this.isPinataFileLimitError(error)) {
        throw new Error(
          "Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue."
        );
      }

      // Log full error details for debugging
      if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
        console.error(`Error stack: ${error.stack}`);
      }

      // Check if it's an axios error with response details
      if ((error as any)?.response) {
        const axiosError = error as any;
        const status = axiosError.response?.status;
        const statusText = axiosError.response?.statusText;
        const data = axiosError.response?.data;

        console.error(`Axios response error:`, {
          status,
          statusText,
          data: typeof data === "string" ? data.substring(0, 200) : data,
          headers: axiosError.response?.headers,
        });

        if (status === 403) {
          throw new Error(
            `Access denied to S3 URL: ${s3Url}. Status: ${status} ${statusText}. The S3 bucket may be private and Lambda needs IAM permissions to access it, or the file URL is incorrect.`
          );
        }
        if (status === 404) {
          throw new Error(
            `File not found at S3 URL: ${s3Url}. Status: ${status} ${statusText}. Please verify the file exists in the S3 bucket.`
          );
        }
        throw new Error(
          `HTTP ${status} ${statusText} when downloading from S3 URL: ${s3Url}. Response: ${typeof data === "string" ? data.substring(0, 200) : JSON.stringify(data)}`
        );
      }

      // If error is already a detailed Error from axios catch block, re-throw it as is
      if (error instanceof Error) {
        // Check if it's already a detailed error message (contains status codes or specific messages)
        if (
          error.message.includes("Status:") ||
          error.message.includes("HTTP") ||
          error.message.includes("File not found") ||
          error.message.includes("Access denied") ||
          error.message.includes("Timeout")
        ) {
          throw error; // Re-throw the detailed error as is
        }
      }

      // For other errors, provide detailed message with original error
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      const errorName = error instanceof Error ? error.name : typeof error;
      throw new Error(
        `Failed to upload file from S3 URL: ${s3Url}. Error type: ${errorName}, Message: ${errorMessage}`
      );
    }
  }

  /**
   * Upload multiple S3 files to Pinata/IPFS with validation
   */
  async uploadS3Files(dto: {
    propertyId: string;
    fileUrls: string[];
    propertyOwnerName?: string;
    propertyType?: string;
    propertyName?: string;
  }): Promise<{
    success: boolean;
    message: string;
    metadataCID?: string;
    uploadedFiles?: Array<{ fileName: string; cid: string; size: number }>;
  }> {
    try {
      // Validate input files
      if (!dto.fileUrls || dto.fileUrls.length === 0) {
        throw new Error("No file URLs provided");
      }

      // URL count limit
      const maxUrlCount = 20;
      if (dto.fileUrls.length > maxUrlCount) {
        throw new Error(
          `Too many URLs provided. Maximum ${maxUrlCount} URLs allowed, received ${dto.fileUrls.length}`
        );
      }

      // Remove duplicate URLs
      const uniqueUrls = [...new Set(dto.fileUrls)];
      if (uniqueUrls.length !== dto.fileUrls.length) {
        const duplicateCount = dto.fileUrls.length - uniqueUrls.length;
        console.warn(`Removed ${duplicateCount} duplicate URLs from request`);
      }

      // Validate file types from URLs
      const allowedExtensions = [
        "pdf",
        "doc",
        "docx",
        "jpg",
        "jpeg",
        "png",
        "json",
        "txt",
        "csv",
        "xls",
        "xlsx",
      ];
      const invalidFiles = uniqueUrls.filter(url => {
        const urlParts = url.split("/");
        const fileName = urlParts[urlParts.length - 1].split("?")[0];
        const fileExtension = fileName.split(".").pop()?.toLowerCase();
        return !fileExtension || !allowedExtensions.includes(fileExtension);
      });

      if (invalidFiles.length > 0) {
        throw new Error(
          `Invalid file types detected. Only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX are allowed for property documents. Invalid files: ${invalidFiles.join(", ")}`
        );
      }

      // Process unique S3 URLs in parallel
      const uploadPromises = uniqueUrls.map(
        async (s3Url, index): Promise<UploadedFileMetadata> => {
          try {
            console.log(
              `Processing S3 URL ${index + 1}/${uniqueUrls.length}: ${s3Url}`
            );
            const result = await this.uploadFileFromS3Url(s3Url);
            return result;
          } catch (error: unknown) {
            if (this.isPinataFileLimitError(error)) {
              throw new Error(
                "Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue."
              );
            }

            const message =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `Failed to upload file from S3 URL ${s3Url}: ${message}`
            );
            throw new Error(`Failed to upload file from S3 URL: ${s3Url}`);
          }
        }
      );

      // Wait for all file uploads to complete
      const uploadedFiles: UploadedFileMetadata[] =
        await Promise.all(uploadPromises);

      // Create and upload metadata
      const metadata: PropertyDocumentsMetadata = {
        propertyId: dto.propertyId,
        propertyOwnerName: dto.propertyOwnerName || "Unknown Owner",
        propertyType: dto.propertyType || "",
        propertyName: dto.propertyName || "",
        documents: uploadedFiles,
        timestamp: new Date().toISOString(),
      };

      console.log(
        `Creating metadata with propertyType: ${metadata.propertyType || "EMPTY"}`
      );

      const metadataCID = await this.uploadMetadata(metadata);

      return {
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} files to Pinata/IPFS`,
        metadataCID,
        uploadedFiles: uploadedFiles.map(file => ({
          fileName: file.name,
          cid: file.cid,
          size: 0, // Size not available in UploadedFileMetadata
        })),
      };
    } catch (error: unknown) {
      if (this.isPinataFileLimitError(error)) {
        throw new Error(
          "Pinata file limit reached. You have reached the maximum number of files (500) allowed on the free Pinata plan. Please upgrade your Pinata plan or remove some files to continue."
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Pinata upload failed:", errorMessage);
      throw new Error(`Pinata upload failed: ${errorMessage}`);
    }
  }
}
