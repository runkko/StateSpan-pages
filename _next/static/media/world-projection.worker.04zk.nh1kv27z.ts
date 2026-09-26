import { createWorldTreeProjector } from "./world-projection-cache";
import { createWorldPatchWriter, type WorldProjectionRequest } from "./world-projection-protocol";

let project = createWorldTreeProjector(), diff = createWorldPatchWriter();
let facts: WorldProjectionRequest["facts"], revision = -1;
self.onmessage = (event: MessageEvent<WorldProjectionRequest>) => {
  const request = event.data;
  try {
    if (request.facts) {
      facts = request.facts; revision = request.revision;
      project = createWorldTreeProjector(); diff = createWorldPatchWriter();
    }
    if (!facts || revision !== request.revision) throw new Error("Projection revision mismatch");
    const tree = project(facts.sessions, facts.types, request.now, request.timezone, facts.earliestMetricAt, facts.hiddenIds);
    self.postMessage({ patch: diff(tree, revision, request.now) });
  } catch {
    self.postMessage({ revision: request.revision, error: "图景生成失败，请刷新重试。" });
  }
};
