# Google Play 스토어 등록정보 — 스페인어

Play Console → 성장 → 스토어 현황 → 기본 스토어 등록정보 → 맨 위 언어 드롭다운에서
로케일을 바꿔 가며 입력한다(언어마다 별도 페이지가 아니라 한 페이지에서 전환).

> **2026-08-05, 1.4.0 출시와 함께 신설된 로케일.**
> Play 스페인어는 **`es-ES`(스페인)** · **`es-419`(라틴아메리카)** · `es-US`(미국) 셋이고,
> **지역 없는 `es` 는 Play 언어 목록에 없다.** 등록한 것은 `es-ES` 와 `es-419` 둘이며
> **같은 텍스트**를 넣는다. `es-US` 는 우선순위가 낮아 제외했다.
>
> Play 등록정보는 **릴리스와 독립**이라 심사 중에도 고칠 수 있다(App Store 는 앱 버전에
> 묶인다 — 두 스토어의 가장 큰 차이).
>
> 앱 이름·전체 설명·용어 원칙은 `ios-es.md` 와 공유한다. 아래는 Play 에만 있는 칸과
> 다른 점만 적는다.

---

## 앱 이름 (최대 30자)

```
Avocado: vocabulario con IA
```

라이브와 같다 — **2026-08-23 개정 범위에서 제외했다. Console 작업 없음.**

> 🔴 **App Store es 는 같은 날 `Avocado: estudiar vocabulario` 로 바꿨는데 Play 는 두었다.**
> en 로케일과 같은 이유다 — Play 는 설치 수·평점이 랭킹을 지배하고 **설명문이 색인**이라 이름
> 효과가 작다. 지금 바꾸면 Console 작업만 늘고 효과는 불확실하다.
>
> ⏳ **판단 시점**: 8/16 에 써 둔 이 로케일의 짧은 설명(77자)·전체 설명(3,875자)이 **아직 미반영**이다.
> 그것을 넣을 때 이름도 함께 볼 것. Play 에서 값이 큰 곳은 이름이 아니라 설명문이다.
>
> 🔑 **App Store 쪽 근거는 `ios-es.md` §검색 실측 에 있다** — 우리 es 칸 19개 토큰 중 18개가 죽어
> 있었고, 유일하게 잡히는 것이 **이름 전체 구절** `vocabulario con IA` 23위였다. 단독 일반어
> (`vocabulario` · `tarjetas` · `inglés`)는 이름·부제에 있어도 전부 200위 밖이다.

## 짧은 설명 (Short description, 최대 80자) — 77자

```
Vocabulario de inglés, coreano, japonés y chino. Una foto y la IA lo rellena.
```

> Play 에만 있는 칸이다(App Store 의 부제·홍보 텍스트와 성격이 다르다).
> 검색 결과와 앱 카드에 항상 붙어 다니므로 **기능 한 줄**로 채운다.
>
> 🔑 **2026-08-16 교체 — 언어명을 색인 칸에 넣었다.** 옛 문안
> (`Haz una foto y tu lista se crea sola. La IA rellena significado y ejemplo.`)은
> **언어명이 하나도 없었다.** Play 는 짧은 설명·전체 설명을 색인하는데(App Store 와 달리)
> 정작 스페인어권 사용자가 치는 말이 어디에도 없어, 검색으로 이 앱에 닿을 길이 없었다.
> 옛 문안의 차별점("사진 한 장이면 AI 가 채운다")은 뒷문장에 그대로 남겼다.
> ko 와 같은 처방이다 → `ko.md` §짧은 설명.

## 검색 실측 (Play 스페인, 2026-08-16)

`play.google.com/store/search?q=…&c=apps&hl=es&gl=ES` 를 그대로 읽어서 셌다.

| 검색어 | 결과 앱 수 | 아보카도 |
|---|---|---|
| `vocabulario inglés` | 16 | 없음 |
| `vocabulario coreano` | 17 | 없음 |
| `aprender coreano vocabulario` | 15 | 없음 |

🔴 **한국에서 쟀던 "스페인어는 비어 있다(경쟁 3개)"가 스페인어권에는 적용되지 않는다.**
그건 *한국인이 스페인어를 배우는* 시장이었고, 여기는 *스페인어권이 영어·한국어를 배우는*
시장이라 16~17개로 붐빈다. 상위권 이름이 전부 `Aprende/Vocabulario + 언어명` 형태다
(`Aprende Vocabulario Ingles` · `Tobo: Vocabulario Coreano` · `Aprende coreano`).
→ 색인 칸에 언어명이 없으면 애초에 후보에도 못 든다.

⚠️ **순위를 기대하지 말 것.** 문구가 바꿀 수 있는 것은 "아예 안 나오던 검색어에 등장하는
것"뿐이다(ko.md 와 같은 단서). 16~17개 경쟁에 다운로드로 이기는 것은 별개 문제다.

## 전체 설명 (Full description, 최대 4000자) — 3851자

> 🔴 **2026-08-24 — Play 용 본문을 여기에 실물로 둔다.** 전에는 "`ios-es.md` 와 동일"이라고만
> 적혀 있었는데, 그 본문에 **iOS 에서만 참인 줄이 둘** 있어 그대로 붙여넣으면 거짓이 된다.
>
> | 줄 | Play 에서 |
> |---|---|
> | `Inicia sesión con Apple o Google` | 🔴 Apple 로그인은 **iOS 전용**(`features/auth/store.ts:334`) → **공용 문구를 중립형으로 고쳤다**(`Inicia sesión para sincronizar en la nube`) |
> | `Compatible con App Tracking Transparency` | 🔴 ATT 는 **iOS 전용**(`lib/ads/admob.ts:15` — Android 에선 모듈이 throw) → **이 본문에서 뺐다** |
>
> 🔑 **두 파일의 차이는 ATT 한 줄뿐이다.** 문구를 고칠 땐 양쪽을 함께 볼 것(README 경고).
> ✅ 화면명은 실측으로 맞다 — `es.json` 의 `stats.title = "Mi aprendizaje"` · `Tarjetas` · `Cuestionario` · `Ejemplos`.
> ✅ `La app habla español, inglés y coreano` 도 참이다(UI 는 en·es·ko 셋뿐).

```
Crea la lista de palabras que quieres. Encuentra la que estabas buscando. Y memoriza cualquiera de las dos de la forma más limpia.

Avocado es una herramienta personal de vocabulario pensada para que cada rato libre cuente: vocabulario de inglés, de coreano, de japonés, de chino y de vietnamita, en cualquier dirección y sea cual sea tu idioma.

• Cuatro modos de estudio
- Tarjetas: una a una, como mejor se te queda
- Cuestionario: preguntas de cuatro opciones para comprobar rápido
- Ejemplos: aprende cada palabra en contexto
- Reproducción automática y shadowing: escucha y repite para trabajar pronunciación y comprensión

• Un ritmo diario que se adapta a ti
- Marca cuántas palabras quieres al día y Avocado las reparte por ti
- Gráficas claras de avance y dominio
- Las palabras que ya dominas y las que se te resisten se llevan por separado
- Marca una palabra con estrella o repasa solo las que fallaste

• Repaso amable — justo antes de que se te olvide
- Las palabras memorizadas vuelven solas justo cuando estás a punto de olvidarlas
- Las que sabes bien vuelven poco; las que fallas, antes — repetición espaciada y sin culpa
- Cada día tiene un tope, así que nada se acumula aunque te saltes unos días
- Un aviso suave al día, y solo si hay algo que repasar

• Rachas y estadísticas
- Racha de días, calendario y palabras aprendidas en "Mi aprendizaje"
- Mira crecer las palabras de hoy, de esta semana y del total
- Comparte tu progreso como imagen

• Añade palabras con una foto o una hoja de cálculo
- Escanea una foto y trae todas las palabras de golpe
- Pega o importa un archivo CSV tal cual
- También hay dictado por voz y entrada manual

• Generación y análisis con IA
- Escribe un tema y la IA te construye la lista entera
  ej.: "Alquilar un apartamento en EE. UU.", "Pedir en una cafetería", "Verbos del TOEIC"
- Añade una palabra y la IA completa pronunciación, significado, ejemplo y traducción
- Elige par de idiomas, dificultad y número de palabras

• Vocabulario en seis idiomas, en cualquier dirección
- Vocabulario de inglés, de coreano, de japonés, de chino y de vietnamita en una sola app
- Escribe una palabra en cualquiera de ellos y la IA rellena significado, ejemplo y pronunciación
- Combina el idioma de origen y el del significado como quieras (ES-EN, EN-KO, ES-JA, cualquier par)
- La app habla español, inglés y coreano

• Listas compartidas por la comunidad
- Explora las listas que comparten otras personas e importa las que te gusten
- Comparte las tuyas para echar una mano

• Ponle tu estilo con los temas
- Clásico, Oscuro, Y2K, Laboratorio, Mar de Verano y más

• Sin conexión primero, con copia en la nube
- Tus datos viven en tu dispositivo: estudia sin internet
- Inicia sesión para sincronizar en la nube
- O entra como invitado y empieza al instante

• Precios justos — lo gratis da para mucho
- Gratis: 300 palabras con IA en las primeras 24 horas, luego 50 al día, y cada anuncio te da +20 (hasta 2 al día)
- El límite es el mismo tanto si inicias sesión como si no
- Un anuncio también quita los banners durante 24 horas
- Aunque agotes el límite, sigues viendo el significado de las palabras
- Pro: sin anuncios y 3.000 palabras al mes, sin límite diario — suscripción mensual o anual (la anual ahorra un 23 %)
- BYOK: usa tu propia clave de Gemini y no hay límite (la de Google AI Studio es gratuita)
- Prueba gratuita de 7 días al empezar Pro (si cancelas durante la prueba, no se cobra nada)

• Privacidad transparente
- Los anuncios solo se muestran a quien no ha iniciado sesión y a usuarios gratuitos (Pro no tiene)
- El único permiso que pedimos es el micrófono, para el dictado

Crea la lista que quieres. Memorízala de la forma más cuidada.

Política de privacidad: https://eunjbaek12.github.io/NewSokSok/privacy-policy
```

## 출시 노트

`release-notes-1.6.0.txt` 의 `<es-ES>` · `<es-419>` 블록.
**로케일당 500자 제한**이며 현재 각 484자다.

> ⚠️ 스페인어는 영어보다 20~25% 길어져, ko·en 과 같은 구조로 옮기면 한도를 넘는다.
> 1.4.0 에서는 「그 밖에」 두 줄을 한 줄로 합쳐 맞췄다.

---

## 그래픽

⏳ **스페인어 전용 자산 없음.** Play 는 언어별 그래픽을 안 올리면 **기본 언어(ko-KR) 것을
그대로 노출**하므로 로케일 추가에 새 캡처가 필수는 아니다. 다만 결과적으로
**등록정보는 스페인어인데 스크린샷은 한국어**가 된다.
스페인어 캡처 준비 사항은 `ios-es.md` 의 「스크린샷」 절 참조.
