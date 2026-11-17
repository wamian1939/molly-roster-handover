import { skillStatusPresentation } from "../../lib/presentation";

export const skillStatusLabels = Object.fromEntries(
  Object.entries(skillStatusPresentation).map(([status, presentation]) => [status, presentation.label]),
) as Record<keyof typeof skillStatusPresentation, string>;

export const skillStatusStyles = Object.fromEntries(
  Object.entries(skillStatusPresentation).map(([status, presentation]) => [status, presentation.style]),
) as Record<keyof typeof skillStatusPresentation, string>;
