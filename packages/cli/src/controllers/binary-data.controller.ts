import { BinaryDataQueryDto, BinaryDataSignedQueryDto, ViewableMimeTypes } from '@n8n/api-types';
import { BinaryDataRepository, ExecutionRepository, type AuthenticatedRequest } from '@n8n/db';
import { Get, Query, RestController } from '@n8n/decorators';
import { PROJECT_OWNER_ROLE_SLUG, type Scope } from '@n8n/permissions';
import { Request, Response } from 'express';
import { JsonWebTokenError } from 'jsonwebtoken';
import {
	BinaryDataService,
	FileNotFoundError,
	getHtmlSandboxCSP,
	isValidNonDefaultMode,
} from 'n8n-core';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { License } from '@/license';
import { WorkflowSharingService } from '@/workflows/workflow-sharing.service';

const EXECUTION_BINARY_DATA_PATH = /^workflows\/([^/]+)\/executions\/([^/]+)\/binary_data\/.+$/;

@RestController('/binary-data')
export class BinaryDataController {
	constructor(
		private readonly binaryDataService: BinaryDataService,
		private readonly binaryDataRepository: BinaryDataRepository,
		private readonly executionRepository: ExecutionRepository,
		private readonly workflowSharingService: WorkflowSharingService,
		private readonly license: License,
	) {}

	@Get('/')
	async get(
		req: AuthenticatedRequest,
		res: Response,
		@Query { id: binaryDataId, action, fileName, mimeType }: BinaryDataQueryDto,
	) {
		try {
			this.validateBinaryDataId(binaryDataId);
			await this.assertCanAccessBinaryData(req, binaryDataId);
			await this.setContentHeaders(binaryDataId, action, res, fileName, mimeType);
			return await this.binaryDataService.getAsStream(binaryDataId);
		} catch (error) {
			if (error instanceof FileNotFoundError) return res.status(404).end();
			if (error instanceof BadRequestError) return res.status(400).end(error.message);
			else throw error;
		}
	}

	@Get('/signed', { skipAuth: true })
	async getSigned(_: Request, res: Response, @Query { token }: BinaryDataSignedQueryDto) {
		try {
			const binaryDataId = this.binaryDataService.validateSignedToken(token);
			this.validateBinaryDataId(binaryDataId);
			await this.setContentHeaders(binaryDataId, 'download', res);
			return await this.binaryDataService.getAsStream(binaryDataId);
		} catch (error) {
			if (error instanceof FileNotFoundError) return res.status(404).end();
			if (error instanceof BadRequestError || error instanceof JsonWebTokenError)
				return res.status(400).end(error.message);
			else throw error;
		}
	}

	private async assertCanAccessBinaryData(req: AuthenticatedRequest, binaryDataId: string) {
		const executionReference = await this.getExecutionReference(binaryDataId);

		if (!executionReference) return;

		const workflowIds = await this.getAccessibleWorkflowIds(req.user, 'workflow:read');

		if (!workflowIds.includes(executionReference.workflowId)) {
			throw new ForbiddenError();
		}
	}

	private async getExecutionReference(binaryDataId: string) {
		const [, fileId] = binaryDataId.split(':', 2);
		const pathMatch = fileId.match(EXECUTION_BINARY_DATA_PATH);

		if (pathMatch) {
			return { workflowId: pathMatch[1], executionId: pathMatch[2] };
		}

		const databaseFileId = this.getDatabaseFileId(binaryDataId);

		if (!databaseFileId) return null;

		const binaryData = await this.binaryDataRepository.findOne({
			where: { fileId: databaseFileId, sourceType: 'execution' },
			select: ['sourceId'],
		});

		if (!binaryData) throw new FileNotFoundError(databaseFileId);

		const execution = await this.executionRepository.findOne({
			where: { id: binaryData.sourceId },
			select: ['id', 'workflowId'],
		});

		if (!execution) throw new FileNotFoundError(databaseFileId);

		return execution;
	}

	private async getAccessibleWorkflowIds(user: AuthenticatedRequest['user'], scope: Scope) {
		if (this.license.isSharingEnabled()) {
			return await this.workflowSharingService.getSharedWorkflowIds(user, { scopes: [scope] });
		}

		return await this.workflowSharingService.getSharedWorkflowIds(user, {
			workflowRoles: ['workflow:owner'],
			projectRoles: [PROJECT_OWNER_ROLE_SLUG],
		});
	}

	private getDatabaseFileId(binaryDataId: string) {
		const [mode, fileId] = binaryDataId.split(':', 2);

		if (mode !== 'database') return null;

		return fileId;
	}

	private validateBinaryDataId(binaryDataId: string) {
		if (!binaryDataId) {
			throw new BadRequestError('Missing binary data ID');
		}

		const separatorIndex = binaryDataId.indexOf(':');

		if (separatorIndex === -1) {
			throw new BadRequestError('Malformed binary data ID');
		}

		const mode = binaryDataId.substring(0, separatorIndex);

		if (!isValidNonDefaultMode(mode)) {
			throw new BadRequestError('Invalid binary data mode');
		}

		const path = binaryDataId.substring(separatorIndex + 1);

		if (path === '' || path === '/' || path === '//') {
			throw new BadRequestError('Malformed binary data ID');
		}
	}

	private async setContentHeaders(
		binaryDataId: string,
		action: 'view' | 'download',
		res: Response,
		fileName?: string,
		mimeType?: string,
	) {
		try {
			const metadata = await this.binaryDataService.getMetadata(binaryDataId);
			fileName = metadata.fileName ?? fileName;
			mimeType = metadata.mimeType ?? mimeType;
			res.setHeader('Content-Length', metadata.fileSize);
		} catch {
			// Metadata lookup is best-effort; fall back to the caller-provided headers.
		}

		if (action === 'view' && (!mimeType || !ViewableMimeTypes.includes(mimeType.toLowerCase()))) {
			throw new BadRequestError('Content not viewable');
		}

		if (mimeType) {
			res.setHeader('Content-Type', mimeType);
		}

		res.setHeader('Content-Security-Policy', getHtmlSandboxCSP());

		if (action === 'download') {
			if (fileName) {
				const encodedFilename = encodeURIComponent(fileName);
				res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`);
			} else {
				res.setHeader('Content-Disposition', 'attachment');
			}
		}
	}
}
