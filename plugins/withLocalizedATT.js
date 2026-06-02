// Expo config plugin: ATT (NSUserTrackingUsageDescription) 메시지를 iOS 다국어로
// 제공한다. Base(영어)는 Info.plist에 직접, 한국어는 ko.lproj/InfoPlist.strings
// 오버라이드로 처리. iOS가 사용자 시스템 언어에 맞춰 자동 매칭.
//
// 다른 권한 메시지(마이크·카메라 등)도 이 plugin의 TRANSLATIONS 표에 키만 추가하면
// 같은 흐름으로 다국어화할 수 있다 — 차후 확장 포인트.
//
// 동작 단계:
//   1. withInfoPlist        Info.plist에 base 영문 NSUserTrackingUsageDescription
//                           + CFBundleDevelopmentRegion + CFBundleLocalizations 설정
//   2. withDangerousMod     ios/<projectName>/<lang>.lproj/InfoPlist.strings 파일 생성
//   3. withXcodeProject     PBXVariantGroup으로 Xcode project resources에 등록
//                           (등록 안 하면 빌드에 포함 안 됨)

const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// 키별로 언어 메시지를 정의. 키는 iOS Info.plist에 들어가는 이름과 동일.
// 새 권한 메시지를 다국어화하고 싶으면 여기에 키 추가.
const TRANSLATIONS = {
  NSUserTrackingUsageDescription: {
    en: 'This permission lets us show you more relevant ads. The app works the same if you decline.',
    ko: '이 식별자는 광고를 더 적절하게 보여드리는 데에만 사용됩니다. 거부해도 앱은 그대로 작동하며 비개인화 광고가 표시됩니다.',
  },
};

const BASE_LANG = 'en';
const STRINGS_FILE_NAME = 'InfoPlist.strings';

// 모든 키·언어 쌍을 평탄화 — 언어별로 작성할 .strings 내용 빌드.
function collectLanguages() {
  const set = new Set();
  for (const key of Object.keys(TRANSLATIONS)) {
    for (const lang of Object.keys(TRANSLATIONS[key])) set.add(lang);
  }
  return Array.from(set);
}

function buildStringsContent(lang) {
  const lines = [];
  for (const [plistKey, translations] of Object.entries(TRANSLATIONS)) {
    const text = translations[lang];
    if (!text) continue;
    const escaped = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    lines.push(`"${plistKey}" = "${escaped}";`);
  }
  return lines.join('\n') + '\n';
}

const withLocalizedATT = (config) => {
  // 1. Info.plist base 값 + 다국어 메타
  config = withInfoPlist(config, (cfg) => {
    for (const [plistKey, translations] of Object.entries(TRANSLATIONS)) {
      if (translations[BASE_LANG]) cfg.modResults[plistKey] = translations[BASE_LANG];
    }
    cfg.modResults.CFBundleDevelopmentRegion =
      cfg.modResults.CFBundleDevelopmentRegion || BASE_LANG;
    const existing = Array.isArray(cfg.modResults.CFBundleLocalizations)
      ? cfg.modResults.CFBundleLocalizations
      : [];
    cfg.modResults.CFBundleLocalizations = Array.from(
      new Set([...existing, ...collectLanguages()]),
    );
    return cfg;
  });

  // 2. <lang>.lproj/InfoPlist.strings 파일 생성
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectName, platformProjectRoot } = cfg.modRequest;
      const targetDir = path.join(platformProjectRoot, projectName);
      for (const lang of collectLanguages()) {
        const lprojDir = path.join(targetDir, `${lang}.lproj`);
        fs.mkdirSync(lprojDir, { recursive: true });
        fs.writeFileSync(
          path.join(lprojDir, STRINGS_FILE_NAME),
          buildStringsContent(lang),
          'utf8',
        );
      }
      return cfg;
    },
  ]);

  // 3. Xcode project에 PBXVariantGroup 등록
  config = withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const objects = proj.hash.project.objects;
    const languages = collectLanguages();

    // 기존 variant group 검색
    let variantGroupUuid = null;
    const variantGroupSection = objects.PBXVariantGroup || {};
    for (const uuid of Object.keys(variantGroupSection)) {
      if (uuid.endsWith('_comment')) continue;
      const entry = variantGroupSection[uuid];
      if (entry && (entry.name === STRINGS_FILE_NAME || entry.path === STRINGS_FILE_NAME)) {
        variantGroupUuid = uuid;
        break;
      }
    }

    if (!variantGroupUuid) {
      variantGroupUuid = proj.generateUuid();
      objects.PBXVariantGroup = objects.PBXVariantGroup || {};
      objects.PBXVariantGroup[variantGroupUuid] = {
        isa: 'PBXVariantGroup',
        children: [],
        name: STRINGS_FILE_NAME,
        sourceTree: '"<group>"',
      };
      objects.PBXVariantGroup[`${variantGroupUuid}_comment`] = STRINGS_FILE_NAME;

      // 앱 그룹(보통 projectName과 같음) 자식으로 등록 → Project Navigator에 노출
      const appGroup = proj.pbxGroupByName(projectName);
      if (appGroup) {
        appGroup.children = appGroup.children || [];
        appGroup.children.push({ value: variantGroupUuid, comment: STRINGS_FILE_NAME });
      }

      // Resources build phase에 등록 → 빌드 시 .strings가 실제로 .app에 포함
      const buildFileUuid = proj.generateUuid();
      objects.PBXBuildFile[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: variantGroupUuid,
        fileRef_comment: STRINGS_FILE_NAME,
      };
      objects.PBXBuildFile[`${buildFileUuid}_comment`] =
        `${STRINGS_FILE_NAME} in Resources`;

      const targetUuid = proj.getFirstTarget().uuid;
      const resourcesPhase = proj.pbxResourcesBuildPhaseObj(targetUuid);
      resourcesPhase.files = resourcesPhase.files || [];
      resourcesPhase.files.push({
        value: buildFileUuid,
        comment: `${STRINGS_FILE_NAME} in Resources`,
      });
    }

    // 언어별 file reference를 variant group children에 추가 (중복 방지)
    const variantGroup = objects.PBXVariantGroup[variantGroupUuid];
    variantGroup.children = variantGroup.children || [];
    const existingLangs = new Set(
      variantGroup.children
        .map((c) => objects.PBXFileReference?.[c.value]?.name)
        .filter(Boolean),
    );

    for (const lang of languages) {
      if (existingLangs.has(lang)) continue;
      const fileRefUuid = proj.generateUuid();
      objects.PBXFileReference = objects.PBXFileReference || {};
      objects.PBXFileReference[fileRefUuid] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.plist.strings',
        name: lang,
        path: `${lang}.lproj/${STRINGS_FILE_NAME}`,
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[`${fileRefUuid}_comment`] = lang;
      variantGroup.children.push({ value: fileRefUuid, comment: lang });
    }

    return cfg;
  });

  return config;
};

module.exports = withLocalizedATT;
