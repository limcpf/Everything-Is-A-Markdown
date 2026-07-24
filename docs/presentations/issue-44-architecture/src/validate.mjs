import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const pptxPath = process.argv[2] ?? path.join(distDir, "eiam-issue-44-architecture-kit-ko.pptx");
const manifestPath = path.join(distDir, "presentation-manifest.json");
const reportPath = path.join(distDir, "validation-report.json");

const EXPECTED_SLIDES = 32;
const REQUIRED_FONT = "Noto Sans CJK KR";
const EMU_PER_INCH = 914400;
const POSITION_TOLERANCE_EMU = 5000;

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function collectText(xml) {
  return normalize(
    Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXml(match[1]))
      .join(" "),
  );
}

function numericSort(left, right) {
  const leftNumber = Number(left.name.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const rightNumber = Number(right.name.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return leftNumber - rightNumber;
}

function parseSlideSize(presentationXml) {
  const match = presentationXml.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (!match) throw new Error("ppt/presentation.xml에 slide size가 없습니다.");
  return { cx: Number(match[1]), cy: Number(match[2]) };
}

function collectBounds(xml) {
  return Array.from(
    xml.matchAll(
      /<a:xfrm[^>]*>[\s\S]*?<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>[\s\S]*?<a:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"\/>[\s\S]*?<\/a:xfrm>/g,
    ),
  ).map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    w: Number(match[3]),
    h: Number(match[4]),
  }));
}

const checks = [];
const failures = [];

function check(id, summary, details, problems = []) {
  checks.push({
    id,
    status: problems.length === 0 ? "passed" : "failed",
    summary,
    details,
  });
  for (const problem of problems) failures.push({ check: id, message: problem });
}

const [pptxBytes, manifestText] = await Promise.all([
  fs.readFile(pptxPath),
  fs.readFile(manifestPath, "utf8"),
]);
const manifest = JSON.parse(manifestText);
const zip = await JSZip.loadAsync(pptxBytes, { checkCRC32: true });
const presentationXml = await zip.file("ppt/presentation.xml").async("string");
const slideSize = parseSlideSize(presentationXml);

const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort(numericSort);
const noteFiles = zip.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).sort(numericSort);
const relationshipFiles = zip.file(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/);
const mediaFiles = zip.file(/^ppt\/media\//);

check("package-integrity", "PPTX ZIP package를 CRC32까지 읽을 수 있다.", {
  bytes: pptxBytes.byteLength,
  entries: Object.keys(zip.files).length,
});

const countProblems = [];
if (slideFiles.length !== EXPECTED_SLIDES) {
  countProblems.push(`슬라이드가 ${EXPECTED_SLIDES}장이 아니라 ${slideFiles.length}장입니다.`);
}
if (manifest.slideCount !== EXPECTED_SLIDES) {
  countProblems.push(`manifest slideCount가 ${EXPECTED_SLIDES}가 아닙니다.`);
}
if (manifest.slides?.length !== EXPECTED_SLIDES) {
  countProblems.push("manifest slides 배열 길이가 올바르지 않습니다.");
}
if (noteFiles.length !== EXPECTED_SLIDES) {
  countProblems.push(`speaker notes가 ${EXPECTED_SLIDES}개가 아니라 ${noteFiles.length}개입니다.`);
}
check(
  "slide-contract",
  "32개 슬라이드와 32개 speaker notes가 manifest와 일치한다.",
  {
    slides: slideFiles.length,
    notes: noteFiles.length,
    manifestSlides: manifest.slides?.length,
  },
  countProblems,
);

const titleProblems = [];
const placeholderProblems = [];
const boundProblems = [];
const slideStats = [];
for (let index = 0; index < slideFiles.length; index += 1) {
  const file = slideFiles[index];
  const xml = await file.async("string");
  const text = collectText(xml);
  const expectedTitle = normalize(manifest.slides[index]?.title ?? "");
  const bounds = collectBounds(xml);
  const normalizedBounds = bounds.map((item) => ({
    minX: Math.min(item.x, item.x + item.w),
    minY: Math.min(item.y, item.y + item.h),
    maxX: Math.max(item.x, item.x + item.w),
    maxY: Math.max(item.y, item.y + item.h),
  }));
  const maxRight = Math.max(0, ...normalizedBounds.map((item) => item.maxX));
  const maxBottom = Math.max(0, ...normalizedBounds.map((item) => item.maxY));

  if (!text.includes(expectedTitle)) {
    titleProblems.push(`${index + 1}번 슬라이드에서 제목을 찾지 못했습니다: ${expectedTitle}`);
  }
  if (/\b(?:TODO|TBD|PLACEHOLDER)\b|\{\{.+?\}\}|<replace[^>]*>/i.test(text)) {
    placeholderProblems.push(`${index + 1}번 슬라이드에 미완성 placeholder가 있습니다.`);
  }
  const slideKind = manifest.slides[index]?.kind;
  const allowedBleed =
    slideKind === "cover" || slideKind === "section" ? 2.25 * EMU_PER_INCH : POSITION_TOLERANCE_EMU;
  normalizedBounds.forEach((item, shapeIndex) => {
    const outOfBounds =
      item.minX < -allowedBleed ||
      item.minY < -allowedBleed ||
      item.maxX > slideSize.cx + allowedBleed ||
      item.maxY > slideSize.cy + allowedBleed;
    if (outOfBounds) {
      boundProblems.push(
        `${index + 1}번 슬라이드 shape ${shapeIndex + 1}가 경계를 벗어납니다: ${JSON.stringify(item)}`,
      );
    }
  });
  slideStats.push({
    number: index + 1,
    characters: text.length,
    shapesWithBounds: bounds.length,
    maxRightInches: Number((maxRight / EMU_PER_INCH).toFixed(3)),
    maxBottomInches: Number((maxBottom / EMU_PER_INCH).toFixed(3)),
  });
}

check(
  "slide-titles",
  "모든 manifest 제목이 해당 슬라이드에 존재한다.",
  { checked: slideFiles.length },
  titleProblems,
);
check(
  "placeholder-scan",
  "TODO, TBD, 템플릿 placeholder가 남아 있지 않다.",
  { checked: slideFiles.length },
  placeholderProblems,
);
check(
  "geometry-bounds",
  "모든 벡터 shape가 16:9 슬라이드 경계 안에 있다.",
  {
    widthInches: Number((slideSize.cx / EMU_PER_INCH).toFixed(3)),
    heightInches: Number((slideSize.cy / EMU_PER_INCH).toFixed(3)),
    toleranceEmu: POSITION_TOLERANCE_EMU,
  },
  boundProblems,
);

const externalRelationshipProblems = [];
for (const relationshipFile of relationshipFiles) {
  const xml = await relationshipFile.async("string");
  if (/TargetMode="External"/.test(xml)) {
    externalRelationshipProblems.push(`${relationshipFile.name}에 외부 relationship가 있습니다.`);
  }
}
check(
  "self-contained",
  "외부 relationship와 raster media 없이 편집 가능한 벡터로 구성된다.",
  {
    slideRelationships: relationshipFiles.length,
    externalRelationships: externalRelationshipProblems.length,
    mediaFiles: mediaFiles.length,
  },
  [
    ...externalRelationshipProblems,
    ...(mediaFiles.length > 0 ? [`ppt/media에 ${mediaFiles.length}개 파일이 있습니다.`] : []),
  ],
);

let fontOccurrences = 0;
for (const file of Object.values(zip.files)) {
  if (file.dir || !file.name.endsWith(".xml")) continue;
  const xml = await file.async("string");
  fontOccurrences += xml.split(REQUIRED_FONT).length - 1;
}
check(
  "korean-font",
  "한글 기본 글꼴이 OOXML에 명시되어 있다.",
  { requiredFont: REQUIRED_FONT, occurrences: fontOccurrences },
  fontOccurrences > 0 ? [] : [`${REQUIRED_FONT} 글꼴 선언을 찾지 못했습니다.`],
);

const sectionTotal = Object.values(manifest.sections ?? {}).reduce(
  (total, value) => total + Number(value),
  0,
);
check(
  "manifest-sections",
  "manifest의 섹션별 슬라이드 수 합계가 전체 슬라이드 수와 같다.",
  { sections: manifest.sections, total: sectionTotal },
  sectionTotal === EXPECTED_SLIDES ? [] : [`섹션 합계가 ${sectionTotal}입니다.`],
);

const report = {
  schemaVersion: 1,
  status: failures.length === 0 ? "passed" : "failed",
  presentation: {
    file: path.basename(pptxPath),
    bytes: pptxBytes.byteLength,
    slides: slideFiles.length,
    notes: noteFiles.length,
    language: manifest.language,
    editableVector: manifest.editableVector,
  },
  checks,
  failures,
  slideStats,
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`Validation failed with ${failures.length} problem(s).`);
  for (const failure of failures) console.error(`- [${failure.check}] ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${slideFiles.length} slides, ${noteFiles.length} notes, and ${fontOccurrences} Korean font declarations.`,
  );
}
