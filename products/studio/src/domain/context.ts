import {
  z,
  AnalysisEntry,
  Delivery,
  LibraryVersion,
  MediaAssetVersion,
  ProjectRevision,
  Proposal,
  RunRecord,
} from "@lightweaver/weaver/contracts";

export const ReviewAnalysis = AnalysisEntry.extend({ state: z.string(), captionLocales: z.array(z.string()).default([]) });
export type ReviewAnalysisEntry = z.infer<typeof ReviewAnalysis>;

export const Context = z.object({
  revision: ProjectRevision,
  assets: z.array(MediaAssetVersion),
  library: z.array(LibraryVersion),
  analysis: z.array(ReviewAnalysis),
  proposals: z.array(Proposal),
  runs: z.array(RunRecord),
  deliveries: z.array(Delivery.extend({ state: z.string() })),
});

export type Context = z.infer<typeof Context>;
