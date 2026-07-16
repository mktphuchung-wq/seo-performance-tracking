export type MemberKpiWeights = {
  seoContent: number;
  seoPerformance: number;
  socialVideo: number;
};

export function validateMemberKpiConfig(input: {
  socialVideoEnabled: boolean;
  weights: MemberKpiWeights;
}) {
  const values = Object.values(input.weights);
  if (
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)
  )
    throw new Error("Member KPI weights must be between 0 and 100.");
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.0001)
    throw new Error(
      `Applied member KPI weights must total 100%; received ${total}.`,
    );
  if (input.socialVideoEnabled && input.weights.socialVideo <= 0)
    throw new Error("Social + Video must have a positive weight when enabled.");
  if (!input.socialVideoEnabled && input.weights.socialVideo !== 0)
    throw new Error("Social + Video weight must be 0% when disabled/N/A.");
  if (
    !input.socialVideoEnabled &&
    Math.abs(input.weights.seoContent + input.weights.seoPerformance - 100) >
      0.0001
  ) {
    throw new Error(
      "SEO Content and SEO Performance weights must total 100% when Social + Video is disabled.",
    );
  }
  return {
    socialVideoEnabled: input.socialVideoEnabled,
    weights: input.weights,
    components: [
      {
        componentKey: "seo_content" as const,
        weightPct: input.weights.seoContent,
        isRequired: true,
        allowsNa: false,
        displayOrder: 10,
      },
      {
        componentKey: "seo_performance" as const,
        weightPct: input.weights.seoPerformance,
        isRequired: false,
        allowsNa: true,
        displayOrder: 20,
      },
      {
        componentKey: "social_video" as const,
        weightPct: input.weights.socialVideo,
        isRequired: input.socialVideoEnabled,
        allowsNa: true,
        displayOrder: 30,
      },
    ],
  };
}
