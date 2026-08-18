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

## 앱 이름 (최대 30자) — 27자

```
Avocado: vocabulario con IA
```

> 검색 가중치가 가장 높은 칸이라 최대 검색량 토큰 `vocabulario`를 넣었다.
> 브랜드는 en 과 같은 `Avocado`로 통일.

## 부제 (Subtitle, 최대 30자) — 29자

```
Tarjetas para aprender inglés
```

> 앱 이름과 토큰이 하나도 안 겹치게 짰다(Apple이 이름·부제·키워드를 자동 재조합하므로
> 중복은 커버리지를 못 넓히고 자리만 먹는다). 스페인어권 학습자의 최대 목표 언어가
> 영어라 `aprender inglés`를 앞세웠다.
>
> ⚠️ **한국어/K-pop 을 여기 넣지 않은 이유** — 큐레이션 목록은 뜻 언어로 걸러지는데
> 한국어 덱은 전부 뜻이 ko/en 이다. 스페인어 사용자가 앱을 열어도 그 덱이 안 보인다.
> → [[project_ko_es_deck_deferred]]

## 홍보 텍스트 (Promotional Text, 최대 170자) — 163자

```
📸 Haz una foto y tu lista se crea sola: la IA rellena significados, ejemplos y pronunciación. Ya en español. 300 palabras con IA el primer día y 50 al día gratis.
```

> 심사를 안 거치는 유일한 칸이라 이모지가 안전하다(ko 의 📸도 그렇게 들어갔다).
> 아직 설치하지 않은 사람이 제품 페이지 맨 위에서 보는 자리이므로 **업데이트 소식이 아니라
> 전환 문구**로 채운다 — 무엇을 해주는 앱인지 + 무료로 얼마나 쓰는지.

## 키워드 (Keywords, 최대 100자, 쉼표 구분, 공백 없이) — 98자

```
memorizar,flashcards,idiomas,coreano,japonés,chino,examen,repaso,palabras,hangul,kpop,TOEIC,verbos
```

> ⚠️ 공백 절대 사용 X. 앱 이름·부제에 이미 든 토큰(vocabulario·IA·tarjetas·aprender·inglés)은
> 뺐다. ❌ 경쟁사 브랜드명(duolingo·memrise)은 넣지 말 것 — Apple 이 거부할 수 있다.

## 설명 (Description, 최대 4000자)

```
Crea la lista de palabras que quieres. Encuentra la que estabas buscando. Y memoriza cualquiera de las dos de la forma más limpia.

Avocado es una herramienta personal de vocabulario pensada para que cada rato libre cuente: vocabulario de inglés, de coreano, de japonés, de chino y de vietnamita, en cualquier dirección y sea cual sea tu idioma.

• Cuatro modos de estudio
- Tarjetas: una a una, como mejor se te queda
- Cuestionario: opción múltiple y respuesta corta
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
- Añade una palabra y la IA completa pronunciación, significado, ejemplos y sinónimos
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
- Un anuncio también quita los banners durante 24 horas
- Aunque agotes el límite, sigues viendo el significado de las palabras
- Pro: sin anuncios y 3.000 palabras al mes, sin límite diario — suscripción mensual o anual (la anual ahorra un 23 %)
- BYOK: usa tu propia clave de Gemini y no hay límite (la de Google AI Studio es gratuita)
- Las primeras 24 horas tras registrarte tienes 300 palabras al día
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
1.4.0

La app ya habla español

El español se suma al coreano y al inglés como idioma completo de la interfaz.

Tema Mar de Verano

Un aguacate con sombrero de paja y un fondo de olas. Ajustes · Tema.

Cuando la IA no puede completar un significado, te dice por qué

Un campo de significado vacío ahora se explica solo, y te dice qué hacer. Hasta ahora se rellenaban la pronunciación y el ejemplo mientras solo el significado se quedaba en blanco, sin forma de saber por qué.

Ve un anuncio y sigue donde lo dejaste

Después de un anuncio recompensado, el autocompletado que estabas esperando se ejecuta solo. Hasta ahora la recompensa llegaba al servidor pero la pantalla no se movía, así que era difícil saber si había llegado.

Además
• Al restaurar una suscripción ahora te decimos el resultado, y una compra vinculada a otra cuenta se bloquea con una explicación.
• Corregidos los textos cortados y el centrado desviado en pantallas estrechas.
```

> ⚠️ **App Store 원고는 이모지를 쓰지 않는다** — `•` 와 `·` 만. 거부 이력은 `▸` 와 `★` 이고
> 이모지 자체가 막힌 건 아니지만, 무이모지가 이 저장소가 지켜 온 방식이다.
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
