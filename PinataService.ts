import { Injectable } from '@nestjs/common';
import PinataClient from '@pinata/sdk';
import pinataSDK from '@pinata/sdk';
import { Readable } from 'stream';

@Injectable()
export class PinataService {
  private pinata: PinataClient;

  constructor() {
    console.log('$$$$$ Pinata API Key:', process.env.PINATA_API_KEY); // Add this
    console.log('$$$$$ Pinata Secret API Key:', process.env.PINATA_SECRET_API_KEY); // Add this
    // Initialize Pinata with the correct configuration
    this.pinata = new pinataSDK({
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY,
    });

    console.log('##### this.pinata', this.pinata);
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      console.log('Uploading file:', file.originalname);
      console.log('File size:', file.size, 'bytes');

      // const readableStream = fs.createReadStream(file.path);
      // Convert buffer to readable stream
      const readableStream = new Readable();
      readableStream.push(file.buffer);
      readableStream.push(null); // Signal end of stream
      const options = { pinataMetadata: { name: file.originalname } };
      console.log('Uploading to Pinata...');

      const result = await this.pinata.pinFileToIPFS(readableStream, options);
      console.log('Upload successful, CID:', result.IpfsHash);

      // fs.unlinkSync(file.path); // Clean up
      return result.IpfsHash;
    } catch (error) {
      console.error('Pinata upload error:', error);
      throw new Error(`Failed to upload file to IPFS: ${error.message}`);
    }
  }

  async uploadMetadata(metadata: any): Promise<string> {
    try {
      console.log('Uploading metadata:', metadata);

      const options = {
        pinataMetadata: {
          name: 'property-documents',
        },
      };

      const result = await this.pinata.pinJSONToIPFS(metadata, options);
      console.log('Metadata upload successful, CID:', result.IpfsHash);

      return result.IpfsHash;
    } catch (error) {
      console.error('Pinata metadata upload error:', error);
      throw new Error(`Failed to upload metadata to IPFS: ${error.message}`);
    }
  }
}
