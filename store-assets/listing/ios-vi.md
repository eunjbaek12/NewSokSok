# App Store Connect 등록 텍스트 — 베트남어 (vi)

대상: **한국어를 배우는 베트남 사용자** (K-POP·한류·취업·유학). App Store Connect → 앱 → App Store → 베트남어 로케일 추가 후 붙여넣기.

> App Store 검색은 **앱 이름 + 부제 + 키워드 필드**만 인덱싱. Apple이 토큰을 자동 조합하므로, 베트남어는 **단어 단위로** 키워드에 넣으면 "học tiếng Hàn" 같은 구가 자동 조합됨(공백 절약).

---

> 🔴 **이 로케일은 App Store Connect 에 아직 등록되어 있지 않다 (2026-08-23 확인).**
> `lookup?id=…&country=VN` 이 우리 **기본 언어(한국어)** 이름을 돌려준다. `languageCodesISO2A = EN,KO,ES`.
> 이 원고는 8/16 에 써 두고 **한 번도 Console 에 넣지 않았다.** → 아래는 "개정안"이 아니라 **신규 등록안**이다.
> 🔴 **로케일을 추가하면 「앱 개인정보」의 개인정보 처리방침 URL 을 이 로케일에도 채워야 한다**
> — 비어 있으면 심사 제출 자체가 막힌다(2026-08-24 실제로 막혔다 · `README.md` §로케일을 새로 추가할 때).
> ✅ **스크린샷은 따로 만들지 않아도 된다** — 기본 언어(English)의 영어 스크린샷을 물려받는다.
> ⚠️ **베트남어 UI 가 없다**(앱 UI 는 en·es·ko 셋) — 그래서 영어 스크린샷이 오히려 실제와 맞는다
> (`README.md` §기본 언어는 English 다).
> 등록정보만 베트남어이고 받으면 영어 화면이다 — 알고 등록하는 것이다.

## 앱 이름 (최대 30자, 검색 가중치 ★★★)

```
Avocado: từ vựng tiếng Hàn
```

26자(한도 30자). **2026-08-23 실측 기준으로 새로 지었다.**

> 🔴 **옛 안 `Học tiếng Hàn - Avocado từ vựng` 는 31자로 한도를 넘겼다** — 그대로 넣었으면 거부됐다.
> (Play 라이브는 공백을 지운 `Học tiếng Hàn-Avocado từ vựng` 30자다.) **자수는 넣기 전에 셀 것.**
>
> **`từ vựng tiếng Hàn` 을 통째로 이름에 넣는다** (공급 190 · 이름 보유 **2개** · 도달 상한 **2위** ·
> 순수요 322,887). 이름 보유가 2개뿐이라 베트남에서 가장 비어 있는 한국어 밭이다.
> 조합으로 `từ vựng`(601,155 · 상한 3위 · **기대값 1위**)과 `tiếng Hàn`(190,774)도 함께 잡는다.
>
> 🔑 **en 로케일과 같은 구조다** — `Avocado: Korean Vocabulary` ↔ `Avocado: từ vựng tiếng Hàn`.
> 뜻 언어가 베트남어인 덱(Tiếng Hàn cơ bản 500)이 있어 약속이 어긋나지 않는다.
>
> ⚠️ **베트남 사용자의 최대 학습 언어는 영어다** — `tiếng Anh` 순수요 **1,066,957** 로 한국어(190,774)의
> 5.6배이고 `từ vựng tiếng Anh` 도 671,763 이다. 그런데도 한국어를 고른 것은 ⑴ 덱 자산이 한국어뿐이고
> ⑵ 영어 밭은 이름 보유 15개에 상한 20위로 우리가 설 자리가 좁기 때문이다. **영어는 키워드의 `Anh`
> 으로 조합만 노린다.**

## 부제 (Subtitle, 최대 30자, 검색 가중치 ★★★)

```
Ôn tập từ của bạn với AI
```

24자(한도 30자). 옛 안은 `Từ vựng, TOPIK, flashcard, K-POP`(나열형).

> **이름과 이어 읽으면 문장이 된다**: *"Avocado: từ vựng tiếng Hàn — Ôn tập từ của bạn với AI"*.
>
> **부제가 여는 밭**: `ôn tập`(공급 191 · 이름 보유 **2개** · 상한 **2위** · 순수요 570,633 ·
> 기대값 285,317) · `ôn tập từ vựng`(조합) · `học từ vựng`(614,743).
>
> 🔑 **`từ của bạn`(당신의 단어)이 ko·en·es·ja 와 같은 축이다.** 다섯 로케일 모두 부제에 "사용자가
> 만드는 단어장"을 담았다.
> ⚠️ **옛 부제는 토큰 나열이었다**(`Từ vựng, TOPIK, flashcard, K-POP`). 부제는 검색 결과 목록에서
> **사람이 읽는 유일한 칸**이므로 문장으로 바꿨다 — 다른 네 로케일과 같은 판단이다.

## 홍보 텍스트 (Promotional Text, 최대 170자, 심사 없이 수시 변경)

```
AI tự động tạo nghĩa, phát âm và câu ví dụ cho từ vựng tiếng Hàn. Quét một tấm ảnh để thêm cả bộ thẻ. Ngày đầu tiên có 300 từ, sau đó mỗi ngày 50 từ vẫn miễn phí.
```

> 1.3.1 갱신(2026-08-02). 전환 문구를 "Pro 7일 무료 체험"에서 **가입 첫날 300단어**로 바꿨다.
> 가입 시점에는 이제 아무 체험도 걸리지 않는다(스토어 오퍼로만 주어진다).
> ⚠️ 신규 덱 4종은 여기 쓰지 않는다 — 전부 ko→en 이라 베트남어 사용자에게는 보이지 않는다.

## 키워드 (Keywords, 최대 100자, 쉼표 구분·공백 없이)

```
thẻ,ghi,nhớ,ôn,TOPIK,phát,âm,ví,dụ,flashcard,Hangeul,sơ,cấp,Anh,Nhật,Trung,ảnh,sổ,tay,AI,luyện,thi
```

98자(한도 100자) · 22토큰.

> ⚠️ **베트남어는 이 칸에서 구조적으로 불리하다.** 키워드 칸은 공백을 쓸 수 없는데 베트남어는 단어가
> 음절 단위로 띄어져 있다 → `thẻ ghi nhớ` 같은 구절을 통째로 넣을 수 없어 `thẻ,ghi,nhớ` 로 쪼개고
> **Apple 의 자동 재조합에 의존**해야 한다. ⚠️ **이 조합이 실제로 작동하는지는 검증하지 못했다** —
> 세 시장 실측에서 강했던 것은 "정확 구절 일치"였고, 그건 이름·부제에서만 쓸 수 있다.
> **다음 실측에서 `thẻ ghi nhớ` 에 우리가 잡히는지 보면 이 물음에 답이 난다.**
>
> - **기대값이 높아 넣은 것**: `ví,dụ`(→ `ví dụ` 이름 보유 **0개** · 상한 **1위** · 385,731) ·
>   `thẻ,ghi,nhớ`(→ `thẻ ghi nhớ` 이름 보유 2개 · 상한 2위 · 321,118) · `phát,âm`(655,661) ·
>   `sơ,cấp`(상한 1위) · `sổ,tay`(→ `sổ tay từ vựng` 이름 보유 0개 · 상한 3위)
> - **다국어 조합용**: `Anh`(→ `từ vựng tiếng Anh` 671,763 · `tiếng Anh` 1,066,957) · `Nhật` · `Trung`
> - **우리 기능·시험**: `TOPIK`(19,497) · `luyện,thi`(시험 대비) · `flashcard`(이름 보유 0개 · 상한 10위) ·
>   `ảnh`(사진) · `AI` · `Hangeul`
> ⚠️ **옛 안은 이름·부제에 이미 있는 말을 키워드에도 넣고 있었다**(`tiếng,Hàn,học,từ,vựng`) — 자동
> 재조합되므로 중복은 자리 낭비다. 전부 뺐다.
> ❌ 경쟁사 브랜드(Duolingo · ELSA · LingoDeer)는 넣지 말 것.

## 검색 실측 (App Store 베트남, 2026-08-23)

🔑 재는 법은 한국과 같다. `country=VN&lang=vi_vn` 으로 바꾼다.

### ① 우리는 베트남 어느 밭에도 없다 — 로케일 미등록이라 당연하다

잰 밭 21개 전부 미진입이다. 로케일이 없어 베트남 스토어 색인이 **KO 칸으로** 이뤄진다.

### ② 베트남은 가장 비어 있는 시장이다

한국어 밭의 이름 보유가 **1~2개**다 — 다섯 시장 중 가장 적다.

| 밭 | 공급 | 이름 보유 | 상한 | 리뷰 0 | 순수요 | 기대값 |
|---|---|---|---|---|---|---|
| `từ vựng` | 189 | 12 | **3위** | 2개 | 601,155 | **200,385** |
| **`từ vựng tiếng Hàn`** | 190 | **2** | **2위** | 0개 | 322,887 | **161,444** ← 이름 |
| `ôn tập` | 191 | **2** | **2위** | 2개 | 570,633 | 285,317 ← 부제 |
| `ví dụ` | 180 | **0** | **1위** | 2개 | 385,731 | 385,731 |
| `thẻ ghi nhớ` | 189 | **2** | **2위** | 2개 | 321,118 | 160,559 |
| `phát âm` | 192 | 3 | 7위 | 0개 | 655,661 | 93,666 |
| `tiếng Anh` | 177 | 15 | 20위 | 1개 | **1,066,957** | 53,348 |
| `từ vựng tiếng Anh` | 181 | 2 | 15위 | 1개 | 671,763 | 44,784 |
| `học tiếng Hàn` | 183 | **1** | 14위 | 0개 | 344,471 | 24,605 |
| `tiếng Hàn` | 186 | 16 | 10위 | 0개 | 190,774 | 19,077 |
| `TOPIK` | 190 | 24 | 8위 | 2개 | 19,497 | 2,437 |

⚠️ **수요가 무관한 앱으로 오염된 밭이 있다** — `thẻ ghi nhớ` 의 최대 앱은 `Ghi âm`(녹음), `sơ cấp` 은
`MB Bank`(은행), `ví dụ` 는 `CamScanner` 다. 일반어라 다른 카테고리가 섞인다.
**최대 앱 이름을 반드시 함께 볼 것** — 스페인에서 세운 규칙이 여기서도 적용된다.

🔴 **상위 20에 리뷰 0인 앱이 0~2개뿐이다**(미국 3~5 · 스페인 3~9). 일본과 마찬가지로 **무명 앱이
상위에 오르기는 미국·스페인보다 어렵다.** 도달 상한이 1~3위인 밭이 여럿이므로 자리는 있다.

### 🔴 ③ 남은 미해결

1. **Play vi 로케일은 이미 등록돼 있다**(`Học tiếng Hàn-Avocado từ vựng`). 이름 통일은 **이번 범위
   밖**이다 — ko·en·es·ja 와 같은 이유. ⚠️ **Play 에 vi 등록정보를 올려 뒀는데 베트남 설치는 0이었다**
   (7/21 기록). **App Store 등록의 기대치도 그렇게 잡을 것.**
2. **키워드 음절 분해가 작동하는지 미검증**(위 §키워드).
3. **베트남어 UI 가 없다.**
4. **영어 밭(순수요 106만)을 사실상 포기했다.** 덱 자산이 한국어뿐이라 내린 결정이지만, es 로케일이
   "덱 0개라 도구 포지션"으로 간 것과 비교하면 **vi 도 도구 포지션(`từ vựng` 단독 · 기대값 200,385)이
   가능했다.** 다음 개정에서 재검토할 것.

## 설명 (Description, 최대 4000자 · 전환용 — 첫 3줄이 중요)

```
Học từ vựng tiếng Hàn, chỉ một ứng dụng.
Avocado là ứng dụng học từ vựng gọn gàng — bạn tự tạo bộ thẻ của mình, còn AI điền nghĩa, phát âm và câu ví dụ. Học từ vựng TOPIK, K-POP và Hallyu bằng flashcard, trắc nghiệm, câu ví dụ và shadowing.

• Thêm từ theo cách nhanh nhất
- Chụp ảnh: chụp một trang sách hoặc vở, ứng dụng tự tách từ ra
- AI tự điền: chỉ cần nhập một từ, nghĩa, phát âm, câu ví dụ và bản dịch được tạo sẵn
- AI tạo bộ từ: chỉ cần viết chủ đề là có cả bộ thẻ (ví dụ: "gọi món ở quán cà phê", "động từ hay gặp trong TOPIK")
- Nhập và xuất Excel (CSV), dán hàng loạt, nhập bằng giọng nói

• 4 chế độ học
- Flashcard: lật thẻ, ghi nhớ trực tiếp
- Trắc nghiệm: bốn lựa chọn, từ nào sai sẽ quay lại
- Câu ví dụ: thấy từ đó được dùng thế nào trong câu
- Tự động phát và shadowing: nghe rồi nói theo, luyện phát âm và nghe cùng lúc

• "Học" — nhịp mỗi ngày
- Chọn số từ muốn học mỗi ngày, kế hoạch ghi nhớ sẽ tự chia
- Xem tỉ lệ học và tỉ lệ thuộc bằng biểu đồ
- Tách riêng từ đã thuộc và từ hay nhầm để ôn hiệu quả hơn
- Gom riêng từ đã đánh dấu sao và từ trả lời sai để học lại

• Ôn tập nhẹ nhàng — đúng lúc bạn sắp quên
- Ứng dụng tự gom lại những từ bạn sắp quên
- Từ đã thuộc thì giãn ra, từ hay sai thì gặp thường xuyên hơn
- Mỗi ngày có giới hạn, nên nghỉ vài hôm cũng không bị dồn một lúc
- Chỉ nhắc một lần mỗi ngày, và chỉ vào ngày thực sự có từ cần ôn

• Chuỗi ngày học và thống kê
- Chuỗi ngày học, lịch và số từ đã thuộc, xem gọn trong một trang
- Số từ thuộc hôm nay, tuần này và từ trước đến giờ cứ thế cộng dồn
- Lưu lại thành tích của bạn dưới dạng hình ảnh

• Bộ từ chính thức
- Bộ từ có nghĩa tiếng Việt: Tiếng Hàn cơ bản 500 (tần suất NIKL · CC BY-SA 4.0) và Tiếng lóng Gen-Z & MZ Hàn Quốc 100
- ※ Trung cấp và cao cấp sẽ bổ sung dần
- Đổi ngôn ngữ nghĩa sang tiếng Anh, bạn có thêm 15 bộ từ tiếng Hàn nữa
  · TOPIK I 350 từ thiết yếu / TOPIK II 300 từ thiết yếu
  · Bộ bốn cấp: cơ bản, trung cấp I, trung cấp II, cao cấp
  · Tiếng lóng K-POP và fan idol 100 / Tiếng lóng Gen-Z 100
  · Từ tượng thanh, tượng hình 100 / Từ tiếng Hàn khó dịch 50 / Phim cổ trang 100
  · Cửa hàng tiện lợi và giao hàng 50 / Chợ 50 / Phòng khám 50 / Leo núi 50
- Bạn cũng có thể chọn ngay bộ từ do người học khác chia sẻ
- Và chia sẻ bộ từ của mình để giúp những người học khác

• Nhiều ngôn ngữ — từ ngôn ngữ nào sang ngôn ngữ nào cũng được
- Tiếng Việt, tiếng Hàn, tiếng Anh, tiếng Nhật, tiếng Trung và tiếng Tây Ban Nha
- Ngôn ngữ nhập và ngôn ngữ nghĩa ghép tự do (Hàn - Việt, Hàn - Anh, Anh - Trung...)

• Giao diện theo ý bạn
- Cổ điển, tối, Y2K, phòng thí nghiệm, biển mùa hè và nhiều chủ đề khác

• Đồng bộ đám mây và ưu tiên ngoại tuyến
- Dữ liệu được lưu vào máy trước, nên không có mạng vẫn học được
- Đăng nhập bằng Sign in with Apple hoặc Google để đồng bộ đám mây
- Không đăng nhập cũng bắt đầu được ngay

• Miễn phí là đủ dùng
- Miễn phí: 24 giờ đầu sau khi đăng ký là 300 từ mỗi ngày, sau đó 50 từ mỗi ngày
- Xem một quảng cáo được thêm 20 từ (tối đa hai lần mỗi ngày)
- Xem một quảng cáo thì banner cũng biến mất trong 24 giờ
- Dùng hết hạn mức, bạn vẫn xem được nghĩa của từ
- Pro: không quảng cáo · 3.000 từ mỗi tháng · không giới hạn theo ngày. Giá theo cửa hàng
- BYOK: dùng khoá API Gemini của riêng bạn thì miễn phí không giới hạn (lấy ở Google AI Studio)
- Pro có 7 ngày dùng thử miễn phí khi bắt đầu đăng ký (huỷ trong thời gian dùng thử sẽ không bị tính phí)

• Riêng tư và minh bạch
- Quảng cáo chỉ hiện với người dùng miễn phí (bản Pro không có quảng cáo)
- Hỗ trợ App Tracking Transparency — bạn tự chọn có cho theo dõi hay không
- Ứng dụng chỉ xin một quyền: micrô để nhập bằng giọng nói (không bắt buộc)

Tạo bộ thẻ bạn muốn theo cách dễ nhất, và ghi nhớ theo cách gọn gàng nhất.

Chính sách bảo mật: https://eunjbaek12.github.io/NewSokSok/privacy-policy
```

> 🔴 **2026-08-24 — 불릿을 `▸` 에서 `•` 로 바꿨다.** **설명 필드는 `▸`(U+25B8)·`↔`·`★` 를 거부한다**
> (2026-07-19 실측). ko·en·es 설명문은 `•` 만 쓰는데 이 파일과 ja·zh 만 `▸` 를 쓰고 있었다.
> ℹ️ 설명 필드는 `·`·`•`·`—` 는 통과하므로 본문의 `·` 는 그대로 둔다(전체 표는
> `ios-ko.md` §스토어가 거부하는 문자).
> ⚠️ **베트남어는 NFC 정규형을 유지할 것** — 결합 문자가 분해형으로 섞이면 리터럴 비교가
> 빗나가고(전례 있음) 자수도 달라진다.
>
> ⚠️ **2026-08-02 수정 — 거짓 문구를 걷어냈다.** 이전 원고는 "Dùng thử 7 ngày, **không tự động trừ tiền**"
> (7일 체험, 자동 차감 없음)이었다. 스토어 오퍼는 해지하지 않으면 자동 결제되므로 사실과 다르다.
> 7/31에 Play 원고(vi.md)만 고치고 iOS 원고는 빠뜨렸다. 새 문구는 ko 원고와 같은 2줄 구조다.

## 새로운 기능 (What's New, 최대 4000자, 버전별 갱신)

```
Cập nhật 1.6.0 - Học bằng câu ví dụ đã tốt hơn nhiều.

[Các lựa chọn không còn mâu thuẫn]
Một từ cũng hợp với chỗ trống sẽ không còn xuất hiện trong các đáp án sai, và một từ có nhiều nghĩa nay cho bạn một câu cho mỗi nghĩa thay vì gộp tất cả lại.

[Thẻ ví dụ rộng hơn]
Vùng chứa câu cao hơn bốn lần. Câu dài không còn bị cắt hay thu nhỏ đến mức khó đọc, chỗ trống ở dòng đầu không còn bị hụt phía trên, và nút loa nằm gọn trong thẻ.

[Cùng một hạn mức dù không đăng nhập]
Đăng nhập không còn quyết định hạn mức của bạn: 50 từ mỗi ngày, 300 từ trong 24 giờ đầu, và mỗi lượt quảng cáo thưởng cho 20 từ, tối đa hai lượt mỗi ngày.

[Bộ từ nay đến từ máy chủ]
Bộ từ mới có thể xuất hiện mà không cần cập nhật ứng dụng. Lần đầu mở danh mục sẽ cần kết nối mạng.

Khác
- Phần giải nghĩa tiếng Hàn trên thẻ nay là giải nghĩa thật, không còn là bản sao của nghĩa tiếng Việt.
- Bộ từ bạn đã lưu vẫn giữ thẻ cũ. Hãy nhập lại bộ từ để nhận các chỉnh sửa.
- Sửa lỗi quảng cáo thưởng không hiện, hoặc xem xong vẫn không tiếp tục.
- Sửa lỗi ứng dụng bị treo trên iPhone khi vượt hạn mức.
```

> **1.6.0 (2026-08-24).** 이모지를 뺐다 — **홍보 텍스트와 이 칸은 이모지와 `·`(U+00B7)를 거부한다**
> (`ios-ko.md` §스토어가 거부하는 문자). 옛 원고는 `🔤`·`📚` 로 시작했다.
> ℹ️ 홍보 텍스트는 원래 이모지가 없어 손대지 않았다. 1,072자 · NFC 정규형 확인.
>
> 🔑 **이 로케일도 한국어 사다리 4덱을 적지 않는다** — 전부 ko→en 이라 뜻 언어가 vi 인 사용자
> 목록에는 뜨지 않는다(도착어 vi 덱은 `Tiếng Hàn cơ bản 500` 과 `Tiếng lóng Gen-Z & MZ` 둘).
> ko·es·ja 와 같고 en 과 정반대다.
>
> 🔑 **"뜻풀이가 진짜 뜻풀이가 됐다"는 이 로케일에는 적었다.** 서버 실측(8/24)으로 로케일마다
> 다시 셌기 때문이다: ko→vi 기본 500 덱은 복사본 **4%**(19장)로 사실상 고쳐졌다.
> ⚠️ 같은 문장을 **ja 에는 적지 않았다** — ko→ja 는 18%가 아직 복사본이다. **옮겨 쓰지 말 것.**
>
> 🔴 **Play 는 따로 줄여야 한다** — 1,072자로 로케일당 500자를 넘는다.

> **2026-08-24 — 전체 설명을 채웠다(3,799자).** 그전까지는 리드 749자뿐이었다.
> ja 와 같은 방식으로 ko 본문을 옮기되 **두 곳을 이 로케일에 맞게 다시 썼다.**
>
> 🔴 **⑴ 옛 리드는 덱을 하나 빠뜨리고 있었다.** `Tiếng Hàn cơ bản 500` 만 적혀 있었는데,
> 서버 실측(8/24) 결과 **뜻 언어가 vi 인 공식 덱은 둘**이다 —
> `Tiếng Hàn cơ bản 500`(500장) · `Tiếng lóng Gen-Z & MZ Hàn Quốc 100`(100장).
> 있는 덱을 안 적는 것도 손해다.
>
> 🔴 **⑵ 덱 목록을 "보이는 것"과 "바꾸면 보이는 것"으로 갈랐다.** ko 본문을 그대로 옮기면
> 베트남어 사용자 목록에 없는 덱을 광고하게 된다(공개 65덱의 뜻 언어: ko 46 · en 15 ·
> vi 2 · zh 1 · ja 1). **"ngôn ngữ nghĩa sang tiếng Anh → 15 bộ từ"** 로 적고 열거했다.
> ja 와 같은 처리다.
>
> 🔑 **리드는 한국어 특화를 유지했다** — 이름 `từ vựng tiếng Hàn` · 부제 `Ôn tập từ của bạn với AI`
> 와 같은 축이다. ja 는 이름이 `写真とAIで作る単語帳` 이라 사진 쪽으로 돌렸는데, **로케일마다
> 포지션이 다르므로 리드도 다르다.**
>
> ⚠️ **3,799자로 한도까지 201자밖에 안 남는다.** 베트남어는 같은 내용이 일본어의 약 2배 길이가
> 된다(ja 1,918자). 나중에 무엇을 넣으려면 무엇을 빼야 한다.
> ⚠️ **Diacritics(성조표기) 반드시 유지** — ASCII 로 쓰면 검색·가독성이 깨진다.
> **NFC 정규형도 유지할 것**(분해형이 섞이면 리터럴 비교가 빗나가고 자수도 달라진다).
> ℹ️ 문자: `•`·`·`·`—`·`※` 만 쓴다(설명 필드 통과 확인). `▸`·`↔`·`★` 는 거부된다.
> ℹ️ 가격은 숫자를 쓰지 않고 `Giá theo cửa hàng` 으로 뒀다.
