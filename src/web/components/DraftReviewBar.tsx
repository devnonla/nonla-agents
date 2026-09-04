import { Button, Popconfirm } from "@nonla-agents/ui";
import { AltArrowRightIcon } from "@solar-icons/react/dynamic/alt-arrow-right";
import { CheckCircleIcon } from "@solar-icons/react/dynamic/check-circle";
import { RestartIcon } from "@solar-icons/react/dynamic/restart";

export interface DraftReviewConfirm {
  title: string;
  description: string;
}

export interface DraftReviewBarProps {
  onApprove: () => void;
  onDiscard: () => void;
  approving?: boolean;
  discarding?: boolean;
  /** Files with unpublished changes. Omit for single-file editors. Empty list hides the bar. */
  changedFiles?: string[];
  currentFile?: string;
  onReviewNext?: () => void;
  /** When set, Approve is wrapped in a confirm (e.g. publishing a live site). */
  approveConfirm?: DraftReviewConfirm;
  discardConfirm?: DraftReviewConfirm;
}

function defaultDiscardConfirm(perFile: boolean, currentFile?: string): DraftReviewConfirm {
  if (perFile && currentFile) {
    return {
      title: `Discard ${currentFile}?`,
      description: "Reset this file to the published version. Other draft files are kept.",
    };
  }
  return {
    title: "Discard draft?",
    description: "Reset to the published version. Unpublished changes will be lost.",
  };
}

export function DraftReviewBar({ onApprove, onDiscard, approving = false, discarding = false, changedFiles, currentFile, onReviewNext, approveConfirm, discardConfirm }: DraftReviewBarProps) {
  if (changedFiles && changedFiles.length === 0) return null;

  const currentIndex = currentFile && changedFiles ? changedFiles.indexOf(currentFile) : -1;
  const onChangedFile = currentIndex >= 0;
  const fileAware = Boolean(currentFile) && Boolean(changedFiles);
  const showDecide = !fileAware || onChangedFile;
  const showNext = fileAware && Boolean(onReviewNext) && (!onChangedFile || (changedFiles?.length ?? 0) > 1);
  const perFile = fileAware && onChangedFile;
  const discard = discardConfirm ?? defaultDiscardConfirm(perFile, currentFile);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      {fileAware ? <span className="mr-1 max-w-40 truncate font-mono text-[11px] font-medium text-muted-foreground">{onChangedFile ? `${currentFile} · ${currentIndex + 1}/${changedFiles?.length}` : `${changedFiles?.length} files to review`}</span> : null}
      {showNext ? (
        <Button size="xs" icon={<AltArrowRightIcon size={12} />} onClick={onReviewNext}>
          {onChangedFile ? "Next file" : "Review next file"}
        </Button>
      ) : null}
      {showDecide ? (
        <>
          <Popconfirm title={discard.title} description={discard.description} okText="Discard" okType="danger" cancelText="Cancel" onConfirm={onDiscard} styles={{ root: { width: 280 } }}>
            <Button size="xs" color="default" variant="filled" icon={<RestartIcon size={12} />} loading={discarding}>
              Discard
            </Button>
          </Popconfirm>
          {approveConfirm ? (
            <Popconfirm title={approveConfirm.title} description={approveConfirm.description} okText="Approve" okButtonProps={{ type: "primary" }} cancelText="Cancel" onConfirm={onApprove} styles={{ root: { width: 280 } }}>
              <Button size="xs" color="green" variant="solid" icon={<CheckCircleIcon size={12} />} loading={approving}>
                Approve
              </Button>
            </Popconfirm>
          ) : (
            <Button size="xs" color="green" variant="solid" icon={<CheckCircleIcon size={12} />} loading={approving} onClick={onApprove}>
              Approve
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
