# الخطة النهائية لبناء عميل برمجة محلي داخل التطبيق مع أقل استهلاك ممكن للتوكنز

## مقدمة
هذه الخطة تصف بناء **Local Code Agent Runtime** داخل التطبيق، مع إبقاء الاستدعاء الخارجي محصورًا في API النموذج فقط.

المنظومة يجب أن تُنفّذ محليًا:
- فهرسة المشروع
- استرجاع السياق
- التخطيط
- التعديل على شكل Patch
- التنفيذ داخل Sandbox
- التحقق (lint/tests/build)
- حلقة إصلاح تلقائي
- إدارة الذاكرة والتكلفة

---

## الهدف
بناء وكيل برمجي يعمل بأسلوب قريب من Codex مع خصائص:
- لا يرسل كامل المشروع للنموذج
- Patch-first بدل إعادة كتابة الملفات
- تحقق محلي آلي بعد كل تعديل
- إصلاح تلقائي بالأدلة الفعلية فقط
- دعم متعدد المزوّدين (Model-agnostic)
- تقليل الهذيان واستهلاك التوكنز

---

## القاعدة الأساسية
التطبيق ليس "Chat على الملفات"؛ بل **محرك تنفيذ وتعديل محلي**.

ركائز الجودة:
1. فهرسة محلية قوية
2. استرجاع سياق ضيق
3. تخطيط محدود
4. إخراج Patch فقط
5. تنفيذ محلي داخل Sandbox
6. تحقق تلقائي
7. Repair Loop
8. ذاكرة محلية فعالة

---

## المعمارية العامة
### المكونات الأساسية
1. Project Workspace Manager
2. Indexing Engine
3. Retrieval Engine
4. Planning Engine
5. Prompt Builder
6. Model Adapter Layer
7. Patch Engine
8. Sandbox Runner
9. Verification Engine
10. Repair Loop Manager
11. Local Cache & Memory Store
12. Usage Budget Controller
13. Audit & Trace Store

### التدفق الأساسي
1. فتح المشروع
2. فهرسة أولية
3. استقبال الطلب
4. التخطيط وتحديد النطاق
5. استرجاع السياق الأدنى
6. بناء Prompt مضغوط
7. استدعاء النموذج عبر Adapter
8. استقبال Patch/Plan/Explanation
9. تطبيق Patch محليًا
10. تشغيل التحقق المحلي
11. نجاح: عرض Diff والنتيجة
12. فشل: Repair Loop بسياق خطأ مصغّر

---

## بيئة التنفيذ المحلية (Sandbox)
المطلوب:
- Python runtime معزول
- Working directory معزول لكل مشروع
- File I/O داخل حدود المشروع فقط
- Shell Allowlist
- Timeout / Memory limit / (CPU limit إن أمكن)
- Network مغلق افتراضيًا
- سجل تشغيل واضح لكل عملية

أدوات مقترحة:
- Python: `tree_sitter`, `pydantic`, `rapidfuzz`, `networkx`, `unidiff`, `watchdog`, `orjson`
- تحقق: `pytest`, `ruff`, `black`, `mypy`
- أدوات نظام: `rg`, `git`, `python`, `bash` محدود, `node`, `npm|pnpm`, `tsc`, `eslint`, `prettier`

---

## الفهرسة المحلية (الأهم)
### لماذا؟
لمنع إرسال المستودع كاملًا للنموذج.

### ما الذي يُفهرس
- شجرة الملفات واللغة والنوع
- hash/size/modified_at
- summaries للملفات
- symbols وعلاقاتها
- imports/exports
- test mappings
- أخطاء lint/build السابقة
- آخر تغييرات مؤثرة

### ما الذي يُستخرج لكل ملف
- classes/functions/methods/constants
- signatures + line ranges
- docstrings (إن وجدت)
- references التقريبية
- module summary

### استراتيجية التحديث
- فهرسة أولية عند فتح المشروع
- فهرسة incremental مع كل تغيير
- تحديث الملخصات عند تغير hash
- إعادة بناء جزئية للـ graph فقط

### SQLite schema (مرجعي)
- `projects`
- `files`
- `symbols`
- `imports`
- `relationships`
- `file_errors`
- `task_history`
- `patch_history`
- `test_runs`
- `file_snapshots`

---

## الاسترجاع الذكي للسياق
### القاعدة الذهبية
- لا ترسل المشروع كاملًا
- لا ترسل الملف كاملًا إلا للضرورة
- لا ترسل Logs/Traces خام وكاملة

### Pipeline مقترح
1. Intent Classification
2. Lexical Search
3. Symbol Search
4. Summary Search
5. Limited Graph Expansion
6. Ranking
7. Span Selection
8. Prompt Assembly

### سياسة Span Selection
- signature + imports اللازمة
- 80–200 سطر حول الموضع غالبًا
- class/function كامل فقط عند الحاجة
- summaries بدل bodies كلما أمكن

### متى نرسل ملفًا كاملًا؟
- ملف صغير
- تعديل واسع داخل نفس الملف
- فشل بسبب نقص سياق مرتين
- refactor شامل في الملف

---

## التخطيط المحلي (Planner)
Planner يقرر فقط: **أقل سياق مطلوب**.

مخرجات موحدة:
```json
{
  "intent": "edit_code | explain | analyze_error | generate_tests | refactor",
  "scope": "small | medium | large",
  "read_more": true,
  "files_to_open": [],
  "symbols_to_open": [],
  "line_ranges": [],
  "needs_tests": true,
  "risk_level": "low | medium | high",
  "expected_output": "patch | explanation | plan"
}
```

---

## Model Adapter Layer (محايد للمزوّد)
واجهة موحدة:
- `classify_task()`
- `summarize_code()`
- `generate_patch()`
- `explain_code()`
- `repair_patch()`
- `request_more_context()`

كل Adapter مسؤول عن:
- تنسيق الرسائل حسب المزود
- إدارة حدود السياق
- تطبيع المخرجات
- التعامل مع أخطاء API
- تسجيل latency/tokens

نتيجة موحدة:
```json
{
  "status": "ok | need_more_context | error",
  "type": "patch | explanation | plan",
  "content": "...",
  "missing_context": [],
  "metadata": {
    "model": "...",
    "latency_ms": 0,
    "input_tokens_est": 0,
    "output_tokens_est": 0
  }
}
```

---

## تصميم البرومبتات
كتل أساسية إلزامية:
1. Prompt مركزي (قواعد صارمة: no hallucination, patch-only, minimal diff)
2. Prompt للتخطيط (JSON فقط)
3. Prompt للإصلاح (fix evidence-based only)
4. Prompt للشرح (concise + source-bounded)

مبادئ ثابتة:
- no prose قبل patch في مهام التعديل
- no assumptions على ملفات غير مرسلة
- request exact missing file/symbol/lines عند نقص السياق

---

## Patch Engine (Patch-Only)
### المعيار الافتراضي
- **Unified Diff**

### بديل احتياطي
- Structured JSON edits

### لماذا Patch-only؟
- Output tokens أقل بكثير
- تقليل hallucination
- تطبيق/rollback أسهل
- تحقق محلي أكثر موثوقية

---

## تطبيق التعديلات محليًا
الخطوات:
1. parse + validate patch
2. التحقق من حدود المسارات المسموحة
3. تطبيق على نسخة العمل
4. إنشاء snapshots قبل/بعد
5. تسجيل النتيجة

عند الفشل:
- إرسال error مختصر + patch + span متأثر فقط
- منع إعادة إرسال المستودع كاملًا

---

## التحقق المحلي (Verification)
ترتيب مقترح:
1. format
2. lint
3. static analysis
4. targeted tests
5. partial build
6. full build عند الحاجة فقط

Python:
- `black` → `ruff` → `mypy` → `pytest` (targeted)

JS/TS:
- `prettier` → `eslint` → `tsc` → `jest|vitest` (targeted)

سياسة logs:
- إرسال ملخص خطأ فقط: tool/file/line/code/message + سياق محدود

---

## Repair Loop
يبدأ عند:
- فشل patch apply
- فشل lint/tests/build/type/import

سياق الإصلاح:
- المهمة الأصلية
- آخر patch
- span المتأثر
- error summary المختصر
- القيود الأصلية

الحد الأقصى:
- محاولة أصلية + إصلاح 1 + إصلاح 2
- بعدها: تدخل المستخدم أو طلب سياق إضافي دقيق

---

## الذاكرة المحلية والتخزين المؤقت
1. Repo Memory
2. Session Memory
3. Task Memory
4. Verification Memory
5. Prompt Cache

الهدف:
- تقليل إعادة الإرسال
- تجنب إعادة حساب summaries/retrieval
- تقليل تكلفة التوكنز بشكل تراكمي

---

## سياسة صارمة لتقليل التوكنز
1. لا ترسل full repo افتراضيًا
2. spans بدل files
3. patch-only outputs
4. planner رخيص ومحلي قدر الإمكان
5. logs مختصرة
6. targeted tests
7. cache لكل ما يمكن إعادة استخدامه
8. repair context صغير جدًا
9. منع الشرح المطوّل في edit tasks
10. تقسيم المهام الكبيرة إلى خطوات صغيرة

---

## سياسة اتخاذ القرار حسب نوع المهمة
- Explain: retrieval خفيف + شرح مختصر
- Small Edit: patch صغير + targeted tests
- Bug Fix: error-driven + repair loop سريع
- Multi-file Feature: تخطيط أولًا + دفعات retrieval
- Refactor: سياق أوسع نسبيًا مع ضبط churn
- Test Generation: ملف الهدف + الاختبارات المجاورة
- Architecture Analysis: summaries أوسع دون bodies كاملة غالبًا

---

## واجهة الأوامر الداخلية المقترحة
- `list_project_files()`
- `search_files(query)`
- `search_symbols(query)`
- `read_file(path, start_line, end_line)`
- `read_symbol(symbol_name)`
- `get_repo_summary()`
- `get_file_summary(path)`
- `get_related_files(path)`
- `get_changed_files()`
- `apply_patch(diff)`
- `run_format(paths)`
- `run_lint(paths)`
- `run_tests(targets)`
- `run_build(targets)`
- `get_last_errors()`
- `create_snapshot()`
- `rollback_snapshot()`

---

## استراتيجية دعم النماذج المختلفة
الثابت معماريًا:
- indexing/retrieval/planning/verification/repair/memory

المتغير حسب النموذج:
- endpoint
- max context
- output limits
- sampling/reasoning options
- message format

الخلاصة: **Architecture ثابتة، النموذج قابل للاستبدال**.

---

## خارطة تنفيذ عملية (10 مراحل)
1. Scan + language detect
2. symbols/summaries extraction
3. graph + SQLite persistence
4. task intake
5. planning
6. narrow retrieval
7. prompt assembly
8. model call
9. patch apply + snapshots
10. verification + repair + user-facing diff

---

## قواعد منع الهذيان
- لا افتراض لملفات/واجهات غير مرسلة
- طلب سياق إضافي بشكل محدد (file/symbol/lines)
- منع تغييرات ضخمة غير مطلوبة
- منع لمس ملفات خارج scope
- التزام صارم بتنسيق الإخراج
- منع أوامر خطرة خارج sandbox

---

## الخلاصة النهائية
أفضل نهج عملي:
- Index once
- Retrieve narrowly
- Plan minimally
- Send spans, not files
- Ask for patch only
- Apply locally
- Verify automatically
- Repair with tiny context
- Cache aggressively
- Keep the model boxed in by architecture

هذه البنية تعطي:
- جودة أعلى عبر مزوّدين متعددين
- تكلفة أقل بشكل كبير
- تقليل hallucination
- تجربة مستقرة واحترافية للمستخدم
