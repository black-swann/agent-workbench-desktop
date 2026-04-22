import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, ModelOption, WorkspaceInfo } from "../types";
import { getModelList } from "../services/tauri";

type UseModelsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useModels({ activeWorkspace, onDebug }: UseModelsOptions) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffort] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const reasoningOptions = useMemo(() => {
    if (!selectedModel) {
      return [];
    }
    return selectedModel.supportedReasoningEfforts.map(
      (effort) => effort.reasoningEffort,
    );
  }, [selectedModel]);

  const workspaceDefaultModel = useMemo(() => {
    const workspaceDefaultModelId = activeWorkspace?.settings.defaultModel ?? null;
    const storedModel =
      models.find(
        (model) =>
          model.id === workspaceDefaultModelId ||
          model.model === workspaceDefaultModelId,
      ) ?? null;
    const preferredModel =
      models.find((model) => model.model === "gpt-5.2-codex") ?? null;
    return storedModel ?? preferredModel ?? models.find((model) => model.isDefault) ?? models[0] ?? null;
  }, [activeWorkspace?.settings.defaultModel, models]);

  const workspaceDefaultEffort = useMemo(() => {
    if (!workspaceDefaultModel) {
      return null;
    }
    const workspaceStoredEffort = activeWorkspace?.settings.defaultEffort ?? null;
    if (workspaceStoredEffort == null) {
      return null;
    }
    return workspaceDefaultModel.supportedReasoningEfforts.some(
      (effort) => effort.reasoningEffort === workspaceStoredEffort,
    )
      ? workspaceStoredEffort
      : workspaceDefaultModel.defaultReasoningEffort ?? null;
  }, [activeWorkspace?.settings.defaultEffort, workspaceDefaultModel]);

  const refreshModels = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-model-list`,
      timestamp: Date.now(),
      source: "client",
      label: "model/list",
      payload: { workspaceId },
    });
    try {
      const response = await getModelList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-model-list`,
        timestamp: Date.now(),
        source: "server",
        label: "model/list response",
        payload: response,
      });
      const rawData = response.result?.data ?? response.data ?? [];
      const data: ModelOption[] = rawData.map((item: any) => ({
        id: String(item.id ?? item.model ?? ""),
        model: String(item.model ?? item.id ?? ""),
        displayName: String(item.displayName ?? item.display_name ?? item.model ?? ""),
        description: String(item.description ?? ""),
        supportedReasoningEfforts: Array.isArray(item.supportedReasoningEfforts)
          ? item.supportedReasoningEfforts
          : Array.isArray(item.supported_reasoning_efforts)
            ? item.supported_reasoning_efforts.map((effort: any) => ({
                reasoningEffort: String(
                  effort.reasoningEffort ?? effort.reasoning_effort ?? "",
                ),
                description: String(effort.description ?? ""),
              }))
            : [],
        defaultReasoningEffort: String(
          item.defaultReasoningEffort ?? item.default_reasoning_effort ?? "",
        ),
        isDefault: Boolean(item.isDefault ?? item.is_default ?? false),
      }));
      setModels(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const workspaceDefaultModelId = activeWorkspace?.settings.defaultModel ?? null;
      const storedModel =
        data.find(
          (model) =>
            model.id === workspaceDefaultModelId ||
            model.model === workspaceDefaultModelId,
        ) ?? null;
      const preferredModel =
        data.find((model) => model.model === "gpt-5.2-codex") ?? null;
      const defaultModel =
        storedModel ??
        preferredModel ??
        data.find((model) => model.isDefault) ??
        data[0] ??
        null;
      const workspaceDefaultEffort = activeWorkspace?.settings.defaultEffort ?? null;
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
        const supportsStoredEffort =
          workspaceDefaultEffort != null &&
          defaultModel.supportedReasoningEfforts.some(
            (effort) => effort.reasoningEffort === workspaceDefaultEffort,
          );
        setSelectedEffort(
          workspaceDefaultEffort == null
            ? null
            : supportsStoredEffort
            ? workspaceDefaultEffort
            : defaultModel.defaultReasoningEffort ?? null,
        );
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-model-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "model/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [activeWorkspace?.settings.defaultEffort, activeWorkspace?.settings.defaultModel, isConnected, onDebug, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && models.length > 0) {
      return;
    }
    refreshModels();
  }, [isConnected, models.length, refreshModels, workspaceId]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    if (selectedEffort == null) {
      return;
    }
    if (
      selectedModel.supportedReasoningEfforts.some(
        (effort) => effort.reasoningEffort === selectedEffort,
      )
    ) {
      return;
    }
    setSelectedEffort(selectedModel.defaultReasoningEffort ?? null);
  }, [selectedEffort, selectedModel]);

  return {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort,
    refreshModels,
    workspaceDefaultModel,
    workspaceDefaultEffort,
  };
}
