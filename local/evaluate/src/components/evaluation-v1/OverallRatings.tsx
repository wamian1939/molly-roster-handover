import type { EvaluationV1Ratings } from "../../types/evaluation";
import { RatingControl } from "./RatingControl";

const ratingDefinitions = [
  {
    key: "speed",
    label: "速度",
    description: "评价员工实际工作的整体速度和高峰跟单能力。",
    options: ["很慢", "偏慢", "正常", "快", "很快"],
    valueDescriptions: ["明显慢于岗位节奏，需要持续协助。", "速度偏慢，高峰期需要提醒。", "能够稳定跟上日常工作节奏。", "整体较快，高峰期基本能跟上节奏。", "速度突出，高峰期仍能保持稳定输出。"],
  },
  {
    key: "initiative",
    label: "眼里有活",
    description: "是否会主动补货、清洁、帮岗，并处理现场需要完成的事情。",
    options: ["很被动", "偏被动", "正常", "主动", "很主动"],
    valueDescriptions: ["通常需要明确指令才开始行动。", "偶尔能发现任务，但仍需要较多提醒。", "能完成职责范围内的现场任务。", "会主动补位、清洁并处理现场需要。", "能持续预判现场需要并带动他人。"],
  },
  {
    key: "attitude",
    label: "态度",
    description: "评价工作配合、责任心、认真程度和接受反馈的态度。",
    options: ["较差", "需改善", "正常", "较好", "很好"],
    valueDescriptions: ["配合度或责任心存在明显问题。", "基本配合，但稳定性需要改善。", "态度稳定，能够正常接受反馈。", "认真可靠，配合度和责任心较好。", "态度成熟，能积极承担并响应反馈。"],
  },
  {
    key: "availability",
    label: "报班自由度",
    description: "由管理者综合判断员工可报班时间和排班灵活程度。",
    options: ["很受限", "较受限", "正常", "较灵活", "很灵活"],
    valueDescriptions: ["可排时间非常有限。", "排班选择较少，需要提前协调。", "可满足常规排班需求。", "可排时间较灵活，便于协调班次。", "可用时间充分，能覆盖多种班次需求。"],
  },
] as const;

type OverallRatingsProps = {
  ratings: EvaluationV1Ratings;
  disabled: boolean;
  onChange: (key: keyof EvaluationV1Ratings, value: number) => void;
};

export function OverallRatings({ ratings, disabled, onChange }: OverallRatingsProps) {
  return (
    <section className="rounded-xl bg-white px-5 py-1 shadow-panel ring-1 ring-graphite-200 sm:px-6">
      <div className="border-b border-graphite-100 py-5">
        <p className="text-xs font-semibold text-graphite-500">人工评分</p>
        <h2 className="mt-1 text-lg font-semibold text-graphite-950">综合评价</h2>
        <p className="mt-1 text-sm text-graphite-600">每项选择最符合员工近期表现的一档。</p>
      </div>
      {ratingDefinitions.map((definition) => (
        <RatingControl
          key={definition.key}
          label={definition.label}
          description={definition.description}
          options={definition.options}
          valueDescriptions={definition.valueDescriptions}
          value={ratings[definition.key]}
          disabled={disabled}
          onChange={(value) => onChange(definition.key, value)}
        />
      ))}
    </section>
  );
}
