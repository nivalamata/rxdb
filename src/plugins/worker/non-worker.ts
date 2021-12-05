import { Observable } from 'rxjs';
import { spawn, Worker } from 'threads';
import {
    RxJsonSchema,
    RxStorage,
    RxStorageInstanceCreationParams,
    MangoQuery,
    RxStorageInstance,
    BlobBuffer,
    BulkWriteRow,
    ChangeStreamOnceOptions,
    RxDocumentData,
    RxStorageBulkWriteResponse,
    RxStorageChangedDocumentMeta,
    RxStorageChangeEvent,
    RxStorageQueryResult,
    RxStorageKeyObjectInstance,
    BulkWriteLocalRow,
    RxLocalDocumentData,
    RxLocalStorageBulkWriteResponse,
    RxKeyObjectStorageInstanceCreationParams
} from '../../types';
import { InWorkerStorage } from './in-worker';

declare type WorkerStorageInternals = {
    rxStorage: RxStorageWorker;
    instanceId: number;
    worker: InWorkerStorage;
}
declare type RxStorageWorkerSettings = {
    workerInput: any;
}

export class RxStorageWorker implements RxStorage<WorkerStorageInternals, any> {
    public name = 'worker';

    public readonly workerPromise: Promise<InWorkerStorage>;
    constructor(
        public readonly settings: RxStorageWorkerSettings,
        public readonly originalStorage: RxStorage<any, any>
    ) {
        console.log('this.settings.workerInput: ' + this.settings.workerInput);
        this.workerPromise = spawn<InWorkerStorage>(new Worker(this.settings.workerInput)) as any;
    }

    hash(data: Buffer | Blob | string): Promise<string> {
        return this.originalStorage.hash(data);
    }

    prepareQuery<RxDocType>(
        schema: RxJsonSchema<RxDocType>,
        mutateableQuery: MangoQuery<RxDocType>
    ) {
        return this.originalStorage.prepareQuery(schema, mutateableQuery);
    }

    getQueryMatcher<RxDocType>(
        schema: RxJsonSchema<RxDocType>,
        query: MangoQuery<RxDocType>
    ) {
        return this.originalStorage.getQueryMatcher(schema, query);
    }

    getSortComparator<RxDocType>(
        schema: RxJsonSchema<RxDocType>,
        query: MangoQuery<RxDocType>
    ) {
        return this.originalStorage.getSortComparator(schema, query);
    }

    async createStorageInstance<RxDocType>(
        params: RxStorageInstanceCreationParams<RxDocType, any>
    ): Promise<RxStorageInstanceWorker<RxDocType>> {
        const worker = await this.workerPromise;
        const instanceId = await worker.createStorageInstance(params);
        return new RxStorageInstanceWorker(
            params.databaseName,
            params.collectionName,
            params.schema,
            {
                rxStorage: this,
                instanceId,
                worker
            },
            params.options
        );
    }

    public async createKeyObjectStorageInstance(
        params: RxKeyObjectStorageInstanceCreationParams<any>
    ): Promise<RxStorageKeyObjectInstanceWorker> {
        const worker = await this.workerPromise;
        const instanceId = await worker.createKeyObjectStorageInstance(params);
        return new RxStorageKeyObjectInstanceWorker(
            params.databaseName,
            params.collectionName,
            {
                rxStorage: this,
                worker,
                instanceId
            },
            params.options
        );
    }
}


export class RxStorageInstanceWorker<DocumentData> implements RxStorageInstance<DocumentData, WorkerStorageInternals, any> {

    constructor(
        public readonly databaseName: string,
        public readonly collectionName: string,
        public readonly schema: Readonly<RxJsonSchema<DocumentData>>,
        public readonly internals: WorkerStorageInternals,
        public readonly options: Readonly<any>
    ) { }

    bulkWrite(documentWrites: BulkWriteRow<DocumentData>[]): Promise<RxStorageBulkWriteResponse<DocumentData>> {
        return this.internals.worker.bulkWrite(
            this.internals.instanceId,
            documentWrites
        );
    }
    bulkAddRevisions(documents: RxDocumentData<DocumentData>[]): Promise<void> {
        return this.internals.worker.bulkAddRevisions(
            this.internals.instanceId,
            documents
        );
    }
    findDocumentsById(ids: string[], deleted: boolean): Promise<Map<string, RxDocumentData<DocumentData>>> {
        return this.internals.worker.findDocumentsById(
            this.internals.instanceId,
            ids,
            deleted
        );
    }
    query(preparedQuery: any): Promise<RxStorageQueryResult<DocumentData>> {
        return this.internals.worker.query(
            this.internals.instanceId,
            preparedQuery
        );
    }
    getAttachmentData(documentId: string, attachmentId: string): Promise<BlobBuffer> {
        return this.internals.worker.getAttachmentData(
            this.internals.instanceId,
            documentId,
            attachmentId
        );
    }
    getChangedDocuments(options: ChangeStreamOnceOptions): Promise<{ changedDocuments: RxStorageChangedDocumentMeta[]; lastSequence: number; }> {
        return this.internals.worker.getChangedDocuments(
            this.internals.instanceId,
            options
        );
    }
    changeStream(): Observable<RxStorageChangeEvent<RxDocumentData<DocumentData>>> {
        return this.internals.worker.changeStream(
            this.internals.instanceId
        );
    }
    close(): Promise<void> {
        return this.internals.worker.close(
            this.internals.instanceId
        );
    }
    remove(): Promise<void> {
        return this.internals.worker.remove(
            this.internals.instanceId
        );
    }
}


export class RxStorageKeyObjectInstanceWorker implements RxStorageKeyObjectInstance<WorkerStorageInternals, any> {

    constructor(
        public readonly databaseName: string,
        public readonly collectionName: string,
        public readonly internals: WorkerStorageInternals,
        public readonly options: Readonly<any>
    ) { }
    bulkWrite<DocumentData>(
        documentWrites: BulkWriteLocalRow<DocumentData>[]
    ): Promise<RxLocalStorageBulkWriteResponse<DocumentData>> {
        return this.internals.worker.bulkWriteLocal(
            this.internals.instanceId,
            documentWrites
        );
    }
    findLocalDocumentsById<DocumentData>(
        ids: string[]
    ): Promise<Map<string, RxLocalDocumentData<DocumentData>>> {
        return this.internals.worker.findLocalDocumentsById(
            this.internals.instanceId,
            ids
        );
    }
    changeStream(): Observable<RxStorageChangeEvent<RxLocalDocumentData<{ [key: string]: any; }>>> {
        return this.internals.worker.changeStream(
            this.internals.instanceId
        );
    }
    close(): Promise<void> {
        return this.internals.worker.close(
            this.internals.instanceId
        );
    }
    remove(): Promise<void> {
        return this.internals.worker.remove(
            this.internals.instanceId
        );
    }
}

export function getRxStorageWorker(
    originalStorage: RxStorage<any, any>,
    settings: RxStorageWorkerSettings
): RxStorageWorker {
    const storage = new RxStorageWorker(settings, originalStorage);
    return storage;
}
