
export interface IMigrateObjectMetadata {
  readonly CacheControl?: string;
  readonly ContentType?: string;
  readonly WebsiteRedirectLocation?: string;
}

export type IMigrateMetadata = Partial<Record<string, IMigrateObjectMetadata>>;
