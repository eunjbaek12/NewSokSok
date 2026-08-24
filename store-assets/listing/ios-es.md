# App Store Connect 등록 텍스트 — 스페인어

App Store Connect → 앱 → App Store → 스페인어 로케일에 그대로 붙여넣기.

> **2026-08-05, 1.4.0 제출과 함께 신설된 로케일.** UI 스페인어가 1.4.0에 들어가면서
> ("앱을 열면 그 로케일 사용자에게 실제로 달라지는가" 기준을 충족) 등록정보도 함께 열었다.
> ASC 스페인어는 **Spanish (Spain)**과 **Spanish (Mexico)**가 따로다 — **두 로케일에 같은
> 텍스트**를 넣었다. 아래 문구는 `tú` 기준에 중립 어휘(`apartamento` 등)로 써서 양쪽 모두
> 자연스럽다.
>
> ⚠️ **앱 안 용어와 맞출 것** — Tarjetas · Cuestionario · Ejemplos · Reproducción automática ·
> Mi aprendizaje · Mar de Verano. 출처는 `i18n/locales/es.json`이다. 스토어 문구를 고칠 때
> 앱 화면 라벨과 어긋나면 사용자가 설명에서 본 기능을 앱에서 못 찾는다.
>
> ⚠️ **`AI`가 아니라 `IA`**, 그리고 **`usted`이 아니라 `tú`**. 앱 번역에서 이 둘을 각각
> 16곳·52곳 고친 이력이 있다 → [[project_i18n_expansion]]

---

## 앱 이름 (최대 30자) — 29자

```
Avocado: estudiar vocabulario
```

> **2026-08-23 개정.** 옛 이름은 `Avocado: vocabulario con IA`.
>
> **왜 바꾸나 — 단독 토큰은 안 잡히고 구절만 잡힌다.** App Store 스페인을 처음 실측하니 우리 es 칸
> 토큰 **19개 중 18개가 죽어 있었다**(§검색 실측). 이름에 `vocabulario` 가 정확히 들어 있는데도
> 그 밭은 **200위 밖**이고, 유일하게 잡히는 것은 **이름 전체 구절인 `vocabulario con IA` 23위**다.
> → **이름은 "실제로 검색되는 구절"이어야 값이 있다.** `con IA` 는 사람이 잘 치지 않는 말이다.
>
> **`estudiar vocabulario` 를 고른 이유** (공급 164 · 이름 보유 8개 · 도달 상한 **1위** ·
> 상위 20에 리뷰 0이 3개 · 순수요 83,359): 잰 밭 44개 중 **기대값 1위**다.
> ⚠️ 순수요는 상위 30위 리뷰 합계에서 리뷰 20만 이상(듀오링고 등)을 뺀 값이다.
>
> 🔑 **스페인어권은 동사형 이름이 관행이다** — `EWA: Aprende idiomas` · `Duolingo - Aprende inglés` ·
> `Busuu: Aprender idiomas` · `Memrise: Habla idiomas`. `estudiar` 가 어색하지 않은 이유다.
>
> **`vocabulario con IA` 는 버리지 않는다** — 부제에 `con IA` 를 남겨 **이름 + 부제 조합**으로 유지한다.
> ⚠️ **조합은 정확 일치보다 약하다**(한국 실측: 이름 정확 일치 5위 vs 조합들은 전부 하위).
> **현재 23위가 내려갈 수 있다.** 그래도 바꾼 것은 그 밭의 순수요가 21,188 로 새 밭의 4분의 1이기 때문이다.
>
> 🔴 **한국어를 앞세울 수 없다.** `coreano` 밭은 상위 20에 리뷰 0이 **0개**(무명 앱이 못 뚫는 밭)이고,
> 무엇보다 **뜻 언어가 스페인어인 큐레이션 덱이 0개**다 → [[project_ko_es_deck_deferred]].
> en 로케일이 ko→en 덱 14개를 근거로 `Korean Vocabulary` 로 특화한 것과 **정반대 상황**이다.
> 그래서 es 는 덱이 아니라 **도구**(내가 만드는 단어장 + AI)로 선다.

## 부제 (Subtitle, 최대 30자) — 30자

```
Tus palabras en inglés, con IA
```

> **2026-08-23 개정.** 옛 부제는 `Tarjetas para aprender inglés`.
>
> **이름과 이어 읽으면 문장이 된다**: *"Avocado: estudiar vocabulario — Tus palabras en inglés, con IA"*.
>
> **부제가 여는 밭**: `palabras en inglés`(공급 139 · 이름 보유 21개 · 상한 **1위** · 리뷰 0이 6개 ·
> 순수요 48,760) · `vocabulario inglés`(115,459 · 상한 7위 · 조합) · `estudiar inglés`(203,270 · 조합) ·
> `vocabulario con IA`(조합으로 유지).
>
> 🔑 **`tus palabras`(너의 단어)가 제품의 실제 약속이다.** es 로케일에는 덱이 없으므로 약속할 수 있는
> 것은 **사용자가 만드는 단어장과 AI 뿐**이다. 실사용도 이를 지지한다 — 직접 만든 단어장 암기율
> 46.5% vs 큐레이션 12.8%.
>
> 🔑 **스페인어권 학습자의 최대 목표어는 영어다.** `inglés` 계열이 다른 어느 언어보다 크다
> (`estudiar inglés` 203,270 · `vocabulario inglés` 115,459 vs `vocabulario japonés` 10,835 ·
> `vocabulario coreano` 11,761).
> ⚠️ **단 `inglés` 단독 밭은 노리지 않는다** — 상한 42위에 상위 20 리뷰 0이 0개다. 조합만 잡는다.

## 홍보 텍스트 (Promotional Text, 최대 170자) — 160자

```
Haz una foto y tu lista se crea sola: la IA rellena significados, ejemplos y pronunciación. Ya en español. 300 palabras con IA el primer día y 50 al día gratis.
```

> 심사를 안 거치는 유일한 칸이라 이모지가 안전하다(ko 의 📸도 그렇게 들어갔다).
> 아직 설치하지 않은 사람이 제품 페이지 맨 위에서 보는 자리이므로 **업데이트 소식이 아니라
> 전환 문구**로 채운다 — 무엇을 해주는 앱인지 + 무료로 얼마나 쓰는지.

## 키워드 (Keywords, 최대 100자, 쉼표 구분, 공백 없이) — 97자

```
repaso,Cambridge,ejemplos,pronunciación,IELTS,verbos,japonés,coreano,chino,examen,fichas,tarjetas
```

> ⚠️ **공백 절대 사용 X.** 12토큰 · 97자. 이름·부제에 든 단어(avocado · estudiar · vocabulario ·
> tus · palabras · en · inglés · con · IA)는 뺐다 — Apple 이 세 칸을 자동 재조합한다.
>
> **2026-08-23 전면 교체.** 옛 13개 토큰
> (`memorizar,flashcards,idiomas,coreano,japonés,chino,examen,repaso,palabras,hangul,kpop,TOEIC,verbos`)은
> **실측에서 전부 죽어 있었다** → 빼도 잃을 것이 없는 상태에서 새로 짰다.
>
> 선정 기준은 **"상위 20에 리뷰 0인 앱이 몇 개인가"** 다(en 로케일에서 확립 · `ios-en.md` §검색 실측 ③).
> - **리뷰 0이 많아 뚫리는 밭**: `repaso`(8개 · 이름 보유 9 · 상한 2위) · `Cambridge`(7개 · **이름
>   보유 1개** · 상한 3위 · 순수요 23,094) · `ejemplos`(7개 · 이름 보유 1 · 상한 1위) ·
>   `pronunciación`(6개 · 상한 3위 · 29,390) · `verbos`(4개 · 상한 1위 · 22,504) · `IELTS`(4개 ·
>   상한 1위 · 16,905) · `examen`(3개 · 75,455) · `tarjetas`(4개 · `tarjetas de memoria` 상한 1위) ·
>   `fichas`(5개 · `fichas de estudio` 상한 1위)
> - **조합 밭용 언어**: `japonés`(→ `vocabulario japonés` 상한 1위 · 10,835) · `coreano`(→
>   `vocabulario coreano` 상한 1위 · 11,761) · `chino`. **단독 밭은 포기한다**(상한 11~23위 · 리뷰 0이 0개).
> - **우리 기능이라 넣은 것**: `repaso`(Gentle SRS) · `ejemplos`(예문) · `pronunciación`(TTS·발음기호).
>
> **뺀 것과 이유**: `memorizar`(이름 보유 7개로 비어 보이지만 **리뷰 0이 0개** = 무명 앱이 못 뚫는다) ·
> `flashcards`(30개 · 리뷰 0이 0개) · `idiomas`(32개 · 상한 41위) · `hangul`(리뷰 0이 0개) ·
> `kpop`(23개 · es 로케일에 한국어 덱이 없어 약속이 어긋난다) · `TOEIC`(리뷰 0이 9개로 뚫리지만
> 순수요 11,117 로 작고, 유럽은 TOEIC 보다 Cambridge·IELTS 가 흔해 그 둘에 자리를 줬다).
> ❌ 경쟁사 브랜드(duolingo · busuu · quizlet)는 넣지 말 것 — 심사 거부 사유가 될 수 있다.

## 검색 실측 (App Store 스페인, 2026-08-23)

**App Store 스페인을 실제로 잰 것은 이번이 처음이다.** 그전까지 es 판단의 근거는 Play 수치뿐이었다.
🔑 재는 법은 한국과 같다(`ios-ko.md` §검색 실측). `country=ES&lang=es_es` 로 바꾼다.
📌 `country=MX` 로 조회해도 라이브 이름이 같다 — 스페인어 원고 한 벌이 ES·MX 양쪽에 쓰인다.

### 🔴 ① 우리 es 칸도 사실상 작동하지 않고 있었다 — 19개 토큰 중 18개 사망

| 칸 | 토큰 | 스페인 순위 |
|---|---|---|
| 이름 | `avocado` | 68위 ← **유일한 생존** |
| 이름 | `vocabulario` · `IA` | 둘 다 없음 |
| 부제 | `tarjetas` · `aprender` · `inglés` | 전부 없음 |
| 키워드 | 13개 전부 | 전부 없음 |

**단 이름 전체 구절인 `vocabulario con IA` 로는 23위에 잡힌다.**
🔑 **이것이 세 시장에서 공통으로 확인된 규칙이다** — 한국 `단어장 학습` 5위, 미국
`vocabulary builder` 94위, 스페인 `vocabulario con IA` 23위. **단독 일반어 토큰은 안 잡히고,
이름 전체와 정확히 일치하는 구절만 잡힌다.** → **이름은 "실제로 검색되는 구절"로 지어야 한다.**

### 🔴 ② "빈 밭"과 "아무도 안 찾는 밭"을 반드시 가를 것

스페인은 밭이 한국·미국보다 비어 보이는데, 상당수가 **검색어 자체가 존재하지 않는 것**이다.

| 밭 | 공급 | 상한 | 리뷰 0 | 순수요 | 판정 |
|---|---|---|---|---|---|
| `cuaderno de vocabulario` | **10** | 1위 | 10개 | **0** | 아무도 안 찾음 |
| `vocabulario con fotos` | **33** | 1위 | 15개 | **8** | 아무도 안 찾음 |
| `selectividad inglés` | 16 | 1위 | 13개 | **5** | 아무도 안 찾음 |
| `repasar` | 56 | 1위 | 12개 | 35 | 아무도 안 찾음 |
| `estudiar vocabulario` | 164 | **1위** | 3개 | **83,359** | ✅ 값이 있다 |

🔑 **공급이 100건 미만이면 빈 밭이 아니라 없는 밭으로 의심할 것.** 한국에서 세운 "공급·수요·도달
상한 세 수로 잰다"가 여기서 실제로 값을 했다 — 세 수 중 하나만 봤으면 `vocabulario con fotos`
(우리 기능과 정확히 맞고 공급 33건!)를 골랐을 것이고, 그 밭은 **순수요가 8**이다.

### ③ 밭 기대값 (순수요 ÷ 도달 상한 · 상위 8)

| 밭 | 공급 | 이름 보유 | 상한 | 리뷰 0 | 순수요 | 기대값 |
|---|---|---|---|---|---|---|
| **`estudiar vocabulario`** | 164 | 8 | **1위** | 3개 | 83,359 | **83,359** ← 이름 |
| `palabras en inglés` | 139 | 21 | **1위** | 6개 | 48,760 | 48,760 ← 부제 |
| `app de vocabulario` | 173 | **2** | 4위 | 1개 | 184,214 | 46,054 |
| `vocabulario` | 179 | 21 | 4위 | 3개 | 106,120 | 26,530 |
| `verbos` | 163 | 36 | 1위 | 4개 | 22,504 | 22,504 |
| `IELTS` | 174 | 31 | 1위 | 4개 | 16,905 | 16,905 |
| `aprender palabras` | 189 | 16 | 12위 | 0개 | 162,758 | 13,563 |
| `vocabulario con IA` | 196 | 5 | 2위 | 7개 | 21,188 | 10,594 ← **현재 23위** |

⚠️ **수요가 게임·비어학 앱으로 오염된 밭이 있다** — `app de vocabulario`·`mi vocabulario` 는 최대 앱이
CodyCross(크로스워드), `aprender palabras` 는 Apalabrados(단어 게임), `lista de palabras` 는
Preguntados 다. **최대 앱 이름을 반드시 함께 볼 것.** `estudiar vocabulario` 를 고른 이유 중
하나가 최대 앱이 EWA(어학 앱)라 오염이 적다는 것이다.

### 🔴 ④ 남은 미해결

1. **Play es 이름은 이번에 손대지 않았다.** 라이브가 `Avocado: vocabulario con IA` 로 App Store
   옛 이름과 같다. en 과 같은 이유다 — Play 는 설명문이 색인이라 이름 효과가 작고, 8/16 에 써 둔
   es 짧은 설명·전체 설명이 **아직 미반영**이다. **그때 함께 판단할 것.**
2. **MX(라틴아메리카) 지형을 따로 재지 않았다.** ES 만 쟀고 원고는 양쪽에 공용이다. 한국에서
   "같은 검색어가 두 스토어에서 정반대"였고 미국·스페인도 서로 달랐으니, **ES ≠ MX 일 수 있다.**
3. **es 덱 0개 문제는 그대로다.** 문구는 덱을 약속하지 않게 짰지만, 근본 해결은 덱 제작이다
   → [[project_ko_es_deck_deferred]].

## 설명 (Description, 최대 4000자)

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
- Pegado masivo: suelta una lista con saltos de línea y listo
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
- Inicia sesión con Apple o Google para sincronizar
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
- Compatible con App Tracking Transparency: tú decides si permites el seguimiento
- El único permiso que pedimos es el micrófono, para el dictado

Crea la lista que quieres. Memorízala de la forma más cuidada.

Política de privacidad: https://eunjbaek12.github.io/NewSokSok/privacy-policy
```

> 🔴 **공식 큐레이션 덱 항목을 의도적으로 뺐다.** ko·en 설명에는 있는 「단어 모음에서 쉽게 다운」
> 절이 여기엔 없다 — `constants/curationData.ts`의 공식 덱 63개를 뜻 언어별로 세면
> **ko 46 · en 13 · vi 2 · ja 1 · zh 1 · es 0** 이고, 스페인어 기기는 뜻 언어가 자동으로 `es`가
> 되어(`features/settings/store.ts` `deriveTargetLang`) 큐레이션 탭이 **빈 목록**으로 열린다.
> 커뮤니티 탭은 이 필터가 안 걸리므로(`features/curation/screen.tsx`) 그쪽만 남겼다.
> **es 덱이 생기면 이 절을 되살릴 것.** → [[project_ko_es_deck_deferred]]
>
> 🔴 **가격을 숫자로 적지 않았다.** 한 벌로 Spain(EUR)과 Mexico(MXN)를 함께 덮어야 해서
> `23 %` 같은 상대 표현만 썼다. ko·en 은 통화가 하나라 숫자를 그대로 둔다 — **세 원고의
> 가격 표기 방식이 다른 것은 의도**다.

## 새로운 기능 (What's New, 버전별 갱신)

```
1.6.0 - Practicar con ejemplos funciona mucho mejor.

[Las opciones ya no se contradicen]
Una palabra que también encaja en el hueco ya no aparece entre las respuestas incorrectas, y una palabra con varios significados ahora te da una frase por cada significado en vez de todas juntas.

[Tarjetas de ejemplo más grandes]
La zona de la frase es más de cuatro veces más alta. Los ejemplos largos ya no se cortan ni se encogen hasta casi desaparecer, un hueco en la primera línea ya no queda cortado por arriba y el botón de audio se queda dentro de la tarjeta.

[Si el catálogo te salía vacío, ahora te explicamos por qué]
Con el significado en español todavía no hay mazos oficiales, así que el catálogo aparecía vacío sin más explicación. Ahora te decimos cuántos mazos hay en otro idioma y te llevamos allí con un toque.

[El mismo límite diario sin iniciar sesión]
Iniciar sesión ya no decide tu límite: 50 palabras al día, 300 durante las primeras 24 horas, y un anuncio recompensado te da 20 palabras hasta dos veces al día.

[Los mazos ahora vienen del servidor]
Pueden aparecer mazos nuevos sin actualizar la app. Necesitarás conexión la primera vez que se cargue el catálogo.

Además
- Los mazos que ya guardaste conservan sus tarjetas antiguas. Vuelve a importar un mazo para recibir las correcciones.
- Arreglados los anuncios recompensados que no aparecían, o que no continuaban después de verlos.
- Arreglado el bloqueo de la app en iPhone al pasarte del límite.
```

> **1.6.0 (2026-08-24).** 스페인어 악센트 외에는 ASCII 만 쓴다.
>
> 🔴 **위에 오래 적혀 있던 "`•` 와 `·` 만 쓰면 된다"는 이제 틀렸다.** 8/24 실측에서
> **홍보 텍스트와 이 칸이 `·`(U+00B7)와 이모지를 거부**했다(설명 필드는 통과 — 전체 표는
> `ios-ko.md` §스토어가 거부하는 문자). 옛 원고는 `Ajustes · Tema` 와 `•` 불릿을 쓰고 있어
> 그대로였다면 붙여넣기에 실패했을 것이다. `•` 의 생사는 아직 미확인이라 `-` 로 바꿨다.
> ⚠️ 7/19 에 기록된 `▸`·`↔`·`★` 거부는 **설명 필드** 얘기이고 이 칸과 별개다.
>
> 🔑 **이 로케일은 한국어 덱을 헤드라인으로 쓸 수 없다.** 도착어가 es 인 공식 덱이 **0개**라
> 스페인어 사용자의 목록에는 1.6.0 의 사다리 4덱이 뜨지 않는다(en 로케일과 정반대).
> 대신 **빈 목록 안내**(`d857723` · `curation.noDeckForMeaningLang*`)를 넣었다 — 이 로케일에서만
> 의미가 있는 개선이고, 실제로 스페인어 사용자가 겪던 첫 화면 문제다.
>
> 🔴 **Play 는 따로 줄여야 한다** — 1,473자로 로케일당 500자를 넘는다. 스페인어는 영어보다
> 20~25% 길어지므로 영어본을 줄인 뒤 옮기면 또 넘친다(`README.md` 「출시 노트를 쓸 때」).
> (Play 출시 노트는 반대로 매번 이모지를 쓴다 → `release-notes-*.txt`)

---

## 스크린샷

⏳ **미준비.** 스페인어 캡처가 없어 기본 언어 것이 노출된다 —
**등록정보는 스페인어인데 화면은 한국어/영어**인 상태다.

만들려면 `store-assets/screenshots/appstore/raw/es` 한 벌(스페인어 UI 실기 촬영)과
`config.json` 각 장의 `es` 캡션 키가 필요하다. 지금은 `raw/{ko,en}` 과 `ko`/`en` 키뿐이다.
**App Store 용 캡처는 iOS 기기로만** 찍어야 한다 → [[project_screenshot_reorder]]

→ 촬영할 때 큐레이션 탭 덱 0개가 화면으로 드러나므로 **그 수정과 함께 묶는 게 자연스럽다.**

## 그 밖의 필드

ko·en 과 동일하다 — 카테고리(교육/참고) · 인앱 결제 상품 · App Privacy 설문 ·
지원 URL · 개인정보처리방침 URL · 심사 노트. `ios-ko.md` 참조.
