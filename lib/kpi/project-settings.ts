export const measurementStrategies = ["new_project", "growth_project", "stable_audit"] as const;
export type MeasurementStrategy = typeof measurementStrategies[number];
