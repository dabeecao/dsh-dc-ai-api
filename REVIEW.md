# Rà soát & sửa `dsh-dc-ai-api` — 01/11/2026

Bản 1.0.0 đã được rà soát toàn bộ và sửa thành **1.1.0**. Tài liệu này ghi lại
từng phát hiện và trạng thái sau khi sửa, để lần sau không phải dò lại.

Kiểm chứng: `npm run check` (syntax + 18 test) và một harness HTTP thật
(`node /tmp/e2e.mjs`) chạy chính các route của plugin.

---

## P0 — Bảo mật

| # | Phát hiện | Trạng thái |
| --- | --- | --- |
| 1.1 | 5 route `/dc-ai-api/*` không xác thực, trả `Access-Control-Allow-Origin: *`, nhận preflight cross-site → chiếm quyền cấu hình, đổi `baseURL` để rò API key, SSRF qua `/test`. | **Đã sửa.** Mọi request đi qua `ctx.connection.admit()` (fence Host/Origin + cookie phiên đã ký, giống `/api`). Không còn header CORS nào; thiếu service `connection` thì route đóng (503) chứ không mở. |
| 1.2 | `debug()` ghi `/workspace/dc-ai-api/debug.log` và ghi cả `apiKey` plaintext mỗi lần apply. | **Đã sửa.** Xoá hẳn `debug()`; chỉ dùng `ctx.logger`, không log secret. |
| 1.3 | Key lưu 2 nơi; mỗi lần boot ghi đè credential store bằng giá trị cũ trong patch; `resolveApiKey` ưu tiên config hơn store. | **Đã sửa.** Bỏ field `apiKey` khỏi `Config`; key chỉ vào credential store qua `credentials.set`; `resolveApiKey` = store → env. |
| 1.4 | `/state` trả `apiKeyMasked` (4 đầu + 4 cuối). | **Đã sửa.** Chỉ còn `apiKeyConfigured` + `apiKeyEnv`. |
| 1.5 | `baseURL` tuỳ ý bị `fetch` (SSRF, kể cả redirect). | **Đã sửa.** `validateBaseURL()`: chỉ http(s), cấm credential nhúng, bắt buộc https cho host công khai, chặn loopback/RFC1918/link-local/IPv6 ULA trừ khi bật `allowPrivateBaseURL`; redirect được kiểm lại từng hop. |

## P1 — Tính đúng đắn

| # | Phát hiện | Trạng thái |
| --- | --- | --- |
| 2.1 | Trang Settings sửa `options` trong RAM → `baseURL`/`api`/`displayName` mất sau restart và bị ghi đè ngược. | **Đã sửa.** Ghi qua `ctx.settings.update(ownId, patch, revision)`; khai báo `settings.configure({ auto: false })` vì plugin có trang riêng. |
| 2.2 | `mutate` không `await` → UI báo thành công giả; `lastError` không hiển thị; conflict revision không retry. | **Đã sửa.** `await mutate`, retry 3 lần khi `SETTINGS_CONFLICT`, đọc lại revision mỗi lần; `lastError` hiển thị thành banner; `/sync` trả `ok:false` + lỗi thật. |
| 2.3 | Single-flight làm rơi request im lặng. | **Đã sửa.** `sync()` chia sẻ một promise đang chạy và trả kết quả của nó. |
| 2.4 | `Config` thiếu 6 option đang được README quảng cáo. | **Đã sửa.** Đủ 12 field, có `.description()`. |
| 2.5 | Schemastery load bằng `createRequire('/opt/dsh/package.json')` + không khai báo dependency → `Config` undefined trên máy user. | **Đã sửa.** Dò theo `import.meta.url` → `process.argv[1]` → `$DSH_HOME/profiles/$DSH_PROFILE`; thêm peer dep `@deepseek-ai/schemastery`. |
| 2.6 | Dò endpoint chỉ fallback khi 404. | **Đã sửa.** Thử `/v1/models` trước rồi `/models`; 401/403 báo "credential bị từ chối" thay vì rơi im lặng về snapshot. |
| 2.7 | models.dev tải lại mỗi lần sync, không cache, chung timeout với gateway. | **Đã sửa.** Cache TTL 6h + `If-None-Match`; lỗi refresh thì dùng bản cũ. |
| 2.8 | `maxTokens` không kẹp theo `contextWindow`. | **Đã sửa.** `Math.min(output, context)`. |
| 2.9 | Ghi provider profile vào namespace bất kỳ có schema chứa `"providers"`. | **Đã sửa.** Chỉ nhận namespace do `llm.listConfigurableProviders()` khai báo cho route này, hoặc đúng `llm-pi-ai`. |
| 2.10 | Ép `compat.supportsDeveloperRole` mỗi lần sync, đè tinh chỉnh của người dùng. | **Đã sửa.** Compat cấp provider của người dùng được merge sau default. |
| 2.11 | `profileSignature` bỏ sót `compat`/`defaultContextWindow`/`defaultMaxTokens`. | **Đã sửa.** So sánh đủ field plugin sở hữu. |
| 2.12 | Code chết: `${route}-chat` unset 2 lần, `${route}-responses` không tồn tại. | **Đã sửa.** Danh sách route cũ được khử trùng. |
| 2.13 | `readBody` không giới hạn. | **Đã sửa.** Cap 64 KiB → 413. |
| 2.14 | **Mới phát hiện:** field `.volatile()` là object `{get,set}`, nên `normalizeOptions` đọc `source[key]` không bao giờ thấy giá trị cấu hình thật (mọi field rơi về DEFAULTS). | **Đã sửa.** `readField()` unwrap `.get()`; có test cho `Config`. |

## P2 — i18n & UI

| # | Phát hiện | Trạng thái |
| --- | --- | --- |
| 3.1 | Dictionary vi/en hardcode trong bundle, không dùng `ctx.locale`, label section hardcode, không có zh. | **Đã sửa.** `ctx.locale.register('dc-ai-api', { zh, en })` + language pack `vi`; slot khai báo `locale: NS` và nhận `t`; thêm `locale/zh.json`. |
| 3.2 | Quota bịa `$41.67` / `$200` khi thiếu dữ liệu. | **Đã sửa.** Thiếu dữ liệu render `—`; trạng thái "chưa có key" tách riêng. |
| 3.3 | Countdown đứng yên. | **Đã sửa.** Tick 1s, tính từ `resets_at` tuyệt đối. |
| 3.4 | Không hiển thị đang dùng live catalog hay snapshot, không hiện `lastError`. | **Đã sửa.** Badge nguồn + thời điểm sync + banner lỗi. |
| 3.5 | Client tự suy luận lại family để chọn nhãn 3/4/5 mức. | **Đã sửa.** Host trả `efforts[]`, UI chỉ đếm. |
| 3.6 | A11y: `div onClick`, label không `htmlFor`, banner không `aria-live`. | **Đã sửa.** `button` + `role=radio/aria-checked`, `htmlFor`/`id`, `role=alert`, `progressbar`, `aria-pressed`. |
| 3.7 | `fetch` không timeout/abort, `setState` sau unmount. | **Đã sửa.** `AbortController` + timeout 20s + cleanup. |
| 3.8 | Chuỗi tiếng Việt rò từ Host ra UI. | **Đã sửa.** Host trả mã (`MISSING_KEY`), client dịch. |

## P3 — Đóng gói

- `package.json`: thêm `scripts` (`test`, `check`, `snapshot`), `engines.node`, `dsh.manifestVersion`, peer `@deepseek-ai/schemastery`, export `./catalog`, version `1.1.0`.
- `test/plugin.test.mjs`: 18 test cho catalog, chính sách base URL, và guard của route.
- `locale/zh.json` mới; `locale/{en,vi}.json` chỉ còn `meta` (bỏ khối `_config` không tồn tại).
- `lib/snapshot.json` sinh lại từ gateway: 22 model chat (đã lọc endpoint tạo ảnh).
- Toàn bộ file về mode `644` (trước là `755`), trừ `scripts/build-snapshot.mjs`.
- `README.md` viết lại: bảng reasoning theo family, mô hình bảo mật, mục giải thích `max` của Gemini, hướng dẫn dev.

---

## Còn mở (không chặn release)

- Chưa có CI (`.github/workflows`) — nên thêm `npm run check` + refresh snapshot định kỳ.
- Chưa có `CHANGELOG.md` / `SECURITY.md`.
- Route HTTP vẫn là 5 endpoint riêng; chuyển hẳn sang Remote RPC sẽ bỏ được cả lớp này, nhưng cần `ctx.remote` hai phía và không còn cần thiết sau khi đã có fence.
- `lib/client.js` vẫn là một file lớn (không build/lint); tách module là việc của bản sau.

---

## Phụ lục 01/11/2026 — thang suy luận lấy từ docs hãng

Bản 1.1.0 đầu tiên giữ `max` cho Gemini vì đo trên proxy thấy nó tốn nhiều token
hơn `high`. Cách đó sai về nguồn gốc: `max` không phải mức của Google, nó chỉ là
spelling mà gateway tình cờ chấp nhận. Đã thay toàn bộ thang bằng bảng lấy từ tài
liệu chính thức, không dùng kết quả đo proxy nữa:

| Hãng | Mức (theo docs) | Nguồn |
| --- | --- | --- |
| DeepSeek | `none` / `low` / `high` / `max` | api-docs.deepseek.com/api/create-chat-completion |
| OpenAI | `low` / `medium` / `high` / `xhigh` / `max` | platform.openai.com/docs/guides/reasoning |
| Gemini | theo từng model: `low`/`medium`/`high`, thêm `minimal` ở Flash & Flash-Lite | ai.google.dev/gemini-api/docs/thinking |
| Claude | `low` / `medium` / `high` / `xhigh` / `max` | platform.claude.com/docs/en/build-with-claude/effort |
| Grok | `low` / `medium` / `high` / `xhigh` (không tắt được) | docs.x.ai/docs/guides/reasoning |
| GLM | `none` / `high` / `max` | docs.z.ai/guides/capabilities/thinking |
| Qwen / khác | một mức duy nhất (chỉ có bật/tắt) | Alibaba Model Studio |

Hai quy tắc rút ra:

1. **`off` chỉ xuất hiện khi hãng có spelling tắt thật** (`none`). Ở các hãng
   không có, `off` chỉ là bỏ trống trường → rơi về mặc định của hãng (đang bật),
   tức là UI nói "tắt" nhưng request vẫn suy luận. Vì vậy Gemini, OpenAI, Claude,
   Grok không còn `off`.
2. **`minimal`/`xhigh` chỉ có ở nơi docs ghi**, và Gemini phải tra theo từng model
   vì Google công bố bảng riêng (`gemini-3-pro-preview` chỉ có `low`/`high`).

Test tương ứng: `test/plugin.test.mjs` → "every family ladder follows its vendor
documentation" và "Gemini uses the documented per-model levels and never offers max".
