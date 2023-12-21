import MultiProgress from "multi-progress";
import ProgressBar, { ProgressBarOptions } from "progress";
import { tap } from "rxjs";
import { ISyncResult, SyncResultType } from "./sync-operator.js";

export class MigrateProgressBars {

  readonly #opts = {
    complete: '=',
    incomplete: ' ',
    width: 50,
  } satisfies Omit<ProgressBarOptions, 'total'>;

  readonly #multiBar = new MultiProgress();
  readonly #filesBar: ProgressBar;
  readonly #bytesBar: ProgressBar;
  readonly #errorsBar: ProgressBar;

  constructor(
    readonly totalFiles: number,
    readonly totalBytes: number,
  ) {
    this.#filesBar = this.#multiBar.newBar(`Files [:bar] :percent :etas`, {
      ...this.#opts,
      total: this.totalFiles,
    });
    this.#bytesBar = this.#multiBar.newBar(`Bytes [:bar] :percent :etas`, {
      ...this.#opts,
      total: this.totalBytes,
    })
    this.#errorsBar = this.#multiBar.newBar(`Errors [:bar] :percent`, {
      complete: 'X',
      incomplete: ' ',
      width: 50,
      total: this.totalFiles,
    })
  }

  /**
   * Create an operator that updates the progress bars according to the SyncResult.
   *
   * @returns operator that doesn't modify the stream.
   */
  reportSyncResult() {
    return tap({
      next: (result: ISyncResult) => {
        if (result.type === SyncResultType.Error) {
          this.#errorsBar.tick(1);
        } else {
          this.#filesBar.tick(1);
          this.#bytesBar.tick(result.size);
        }
      },
      error: () => {
        this.#errorsBar.tick(1);
      }
    });
  }
}
