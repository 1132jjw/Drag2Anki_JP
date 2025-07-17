import re
import json

input_file = "data/jp_kr.txt"
output_file = "data/jp_simp_to_kr_trad.json"

mapping = {}

with open(input_file, encoding="utf-8") as f:
    for line in f:
        m = re.match(
            r"\|\|\{\{\{\+3 \[include\(틀:ja, text= ([^\]]+)\)\]\}\}\} \|\|\{\{\{\+3 \[include\(틀:ja, text= ([^\]]+)\)\]\}\}\}",
            line,
        )
        if m:
            trad = m.group(1).strip()
            simp = m.group(2).strip()
            mapping[simp] = trad

with open(output_file, "w", encoding="utf-8") as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)

print(f"일본 신자체→한국 정자체 매핑 {len(mapping)}개 생성 완료")
