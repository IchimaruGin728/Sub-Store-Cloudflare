import { useState } from "preact/hooks";

interface Processor {
	type: string;
	[key: string]: any;
}

interface Props {
	onApply?: (processors: Processor[]) => void;
}

const PROCESSOR_TYPES = [
	{ value: "dedupe", label: "Dedupe", desc: "Remove duplicate nodes" },
	{ value: "useless-filter", label: "Useless Filter", desc: "Remove useless nodes" },
	{ value: "region-filter", label: "Region Filter", desc: "Filter by region" },
	{ value: "type-filter", label: "Type Filter", desc: "Filter by protocol type" },
	{ value: "filter", label: "Text Filter", desc: "Include/exclude by text" },
	{ value: "regex-filter", label: "Regex Filter", desc: "Filter by regex" },
	{ value: "rename", label: "Rename", desc: "Rename nodes" },
	{ value: "regex-rename", label: "Regex Rename", desc: "Rename by regex" },
	{ value: "delete", label: "Delete", desc: "Delete matching nodes" },
	{ value: "flag", label: "Flag", desc: "Add country flags" },
	{ value: "tag", label: "Tag", desc: "Add protocol/network tags" },
	{ value: "set", label: "Set Property", desc: "Set node properties" },
	{ value: "sort", label: "Sort", desc: "Sort nodes" },
	{ value: "regex-sort", label: "Regex Sort", desc: "Sort by regex match" },
	{ value: "limit", label: "Limit", desc: "Limit number of nodes" },
	{ value: "reverse", label: "Reverse", desc: "Reverse order" },
];

export default function ProcessorBuilder({ onApply }: Props) {
	const [processors, setProcessors] = useState<Processor[]>([]);
	const [selectedType, setSelectedType] = useState("dedupe");

	const addProcessor = () => {
		const proc: Processor = { type: selectedType };

		// Add default options based on type
		if (selectedType === "region-filter") {
			proc.regions = ["HK", "SG", "JP", "US"];
			proc.keep = true;
		} else if (selectedType === "filter") {
			proc.include = "";
		} else if (selectedType === "rename") {
			proc.prefix = "";
		} else if (selectedType === "limit") {
			proc.limit = 10;
		}

		setProcessors([...processors, proc]);
	};

	const removeProcessor = (index: number) => {
		setProcessors(processors.filter((_, i) => i !== index));
	};

	const updateProcessor = (index: number, key: string, value: any) => {
		const updated = [...processors];
		updated[index] = { ...updated[index], [key]: value };
		setProcessors(updated);
	};

	return (
		<div class="space-y-4">
			<div class="flex gap-2 items-end">
				<div class="flex-1">
					<label class="block text-sm font-medium mb-1">Processor Type</label>
					<select
						class="input-field"
						value={selectedType}
						onChange={(e) => setSelectedType((e.target as HTMLSelectElement).value)}
					>
						{PROCESSOR_TYPES.map((p) => (
							<option key={p.value} value={p.value}>
								{p.label} — {p.desc}
							</option>
						))}
					</select>
				</div>
				<button type="button" class="btn-primary" onClick={addProcessor}>
					Add
				</button>
			</div>

			{processors.length > 0 && (
				<div class="space-y-2">
					<p class="text-sm font-medium">Pipeline ({processors.length} steps):</p>
					{processors.map((proc, i) => (
						<div key={i} class="card flex items-start gap-3">
							<span class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
								{i + 1}
							</span>
							<div class="flex-1 space-y-2">
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">{proc.type}</span>
									<button
										type="button"
										class="text-red-500 text-xs hover:underline"
										onClick={() => removeProcessor(i)}
									>
										Remove
									</button>
								</div>
								{proc.type === "region-filter" && (
									<input
										class="input-field text-sm"
										placeholder="Regions (comma separated): HK,SG,JP"
										value={proc.regions?.join(",") || ""}
										onInput={(e) =>
											updateProcessor(
												i,
												"regions",
												(e.target as HTMLInputElement).value
													.split(",")
													.map((s) => s.trim())
													.filter(Boolean),
											)
										}
									/>
								)}
								{proc.type === "filter" && (
									<input
										class="input-field text-sm"
										placeholder="Include pattern (e.g. HK|SG)"
										value={proc.include || ""}
										onInput={(e) =>
											updateProcessor(i, "include", (e.target as HTMLInputElement).value)
										}
									/>
								)}
								{proc.type === "rename" && (
									<div class="flex gap-2">
										<input
											class="input-field text-sm"
											placeholder="Prefix"
											value={proc.prefix || ""}
											onInput={(e) =>
												updateProcessor(i, "prefix", (e.target as HTMLInputElement).value)
											}
										/>
										<input
											class="input-field text-sm"
											placeholder="Suffix"
											value={proc.suffix || ""}
											onInput={(e) =>
												updateProcessor(i, "suffix", (e.target as HTMLInputElement).value)
											}
										/>
									</div>
								)}
								{proc.type === "limit" && (
									<input
										type="number"
										class="input-field text-sm w-24"
										value={proc.limit || 10}
										onInput={(e) =>
											updateProcessor(
												i,
												"limit",
												Number.parseInt((e.target as HTMLInputElement).value) || 10,
											)
										}
									/>
								)}
								{proc.type === "sort" && (
									<select
										class="input-field text-sm"
										value={proc.by || "name"}
										onChange={(e) =>
											updateProcessor(i, "by", (e.target as HTMLSelectElement).value)
										}
									>
										<option value="name">Name</option>
										<option value="server">Server</option>
										<option value="port">Port</option>
										<option value="protocol">Protocol</option>
									</select>
								)}
							</div>
						</div>
					))}

					<button
						type="button"
						class="btn-primary w-full"
						onClick={() => onApply?.(processors)}
					>
						Apply Pipeline
					</button>
				</div>
			)}
		</div>
	);
}
