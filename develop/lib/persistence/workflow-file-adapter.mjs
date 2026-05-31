import { readJson } from '../workflow/json-io.mjs';
import { defaultRepositoryRootForWorkflow } from '../workflow/resource-resolver.mjs';

/** Filesystem adapter for workflow document DTOs and repository-root discovery. */
export class WorkflowFileAdapter {
  readWorkflow(path, name = 'workflow') {
    return readJson(path, name);
  }

  readJson(path, name = 'json document') {
    return readJson(path, name);
  }

  repositoryRootForWorkflow(path) {
    return defaultRepositoryRootForWorkflow(path);
  }
}
