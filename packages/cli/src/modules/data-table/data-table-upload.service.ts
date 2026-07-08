import { safeJoinPath } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { readFile, unlink, writeFile } from 'fs/promises';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';

type UploadMetadata = {
	userId: string;
};

@Service()
export class DataTableUploadService {
	private readonly uploadDir: string;

	constructor(private readonly globalConfig: GlobalConfig) {
		this.uploadDir = this.globalConfig.dataTable.uploadDir;
	}

	async saveOwner(fileId: string, userId: string): Promise<void> {
		await writeFile(this.getMetadataPath(fileId), JSON.stringify({ userId }), 'utf8');
	}

	async assertOwnedBy(fileId: string, userId: string): Promise<void> {
		const metadata = await this.readMetadata(fileId);
		if (metadata.userId !== userId) {
			throw new ForbiddenError('CSV upload is not available to this user');
		}
	}

	async deleteMetadata(fileId: string): Promise<void> {
		try {
			await unlink(this.getMetadataPath(fileId));
		} catch (error) {
			if (!this.isErrnoException(error) || error.code !== 'ENOENT') {
				throw error;
			}
		}
	}

	private async readMetadata(fileId: string): Promise<UploadMetadata> {
		try {
			const rawMetadata = await readFile(this.getMetadataPath(fileId), 'utf8');
			const metadata: unknown = JSON.parse(rawMetadata);
			if (this.isUploadMetadata(metadata)) return metadata;
		} catch {}

		throw new ForbiddenError('CSV upload is not available to this user');
	}

	private isUploadMetadata(metadata: unknown): metadata is UploadMetadata {
		return (
			typeof metadata === 'object' &&
			metadata !== null &&
			'userId' in metadata &&
			typeof metadata.userId === 'string'
		);
	}

	private getMetadataPath(fileId: string): string {
		return safeJoinPath(this.uploadDir, `${fileId}.metadata.json`);
	}

	private isErrnoException(error: unknown): error is NodeJS.ErrnoException {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof (error as { code: unknown }).code === 'string'
		);
	}
}
