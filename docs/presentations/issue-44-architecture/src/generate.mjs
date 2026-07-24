import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "dist");
const outputFile = path.join(outputDir, "eiam-issue-44-architecture-kit-ko.pptx");
const manifestFile = path.join(outputDir, "presentation-manifest.json");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Everything Is A Markdown contributors";
pptx.company = "Everything Is A Markdown";
pptx.subject = "이슈 #44 빌드·호스팅·릴리스 아키텍처와 재사용 가능한 WAS 참조 아키텍처";
pptx.title = "EIAM 이슈 #44 아키텍처 PPT 키트";
pptx.lang = "ko-KR";
pptx.rtlMode = false;
pptx.theme = {
  headFontFace: "Noto Sans CJK KR",
  bodyFontFace: "Noto Sans CJK KR",
  lang: "ko-KR",
};

const S = pptx.ShapeType;
const W = 13.333;
const H = 7.5;
const FONT = "Noto Sans CJK KR";
const MONO = "Noto Sans Mono CJK KR";

const C = {
  ink: "0B1220",
  navy: "111C32",
  slate900: "162033",
  slate800: "24324A",
  slate700: "334155",
  slate600: "475569",
  slate500: "64748B",
  slate400: "94A3B8",
  slate300: "CBD5E1",
  slate200: "E2E8F0",
  slate100: "F1F5F9",
  paper: "F8FAFC",
  white: "FFFFFF",
  blue: "2563EB",
  blueDark: "1D4ED8",
  blueSoft: "DBEAFE",
  cyan: "06B6D4",
  cyanSoft: "CFFAFE",
  emerald: "10B981",
  emeraldSoft: "D1FAE5",
  amber: "F59E0B",
  amberSoft: "FEF3C7",
  rose: "F43F5E",
  roseSoft: "FFE4E6",
  violet: "7C3AED",
  violetSoft: "EDE9FE",
};

const shadow = {
  type: "outer",
  color: C.ink,
  opacity: 0.12,
  blur: 2,
  angle: 45,
  offset: 1,
};

const slides = [];

function text(slide, value, x, y, w, h, options = {}) {
  slide.addText(value, {
    x,
    y,
    w,
    h,
    fontFace: options.fontFace ?? FONT,
    fontSize: options.fontSize ?? 12,
    color: options.color ?? C.slate700,
    bold: options.bold ?? false,
    breakLine: false,
    margin: options.margin ?? 0,
    valign: options.valign ?? "mid",
    align: options.align ?? "left",
    fit: options.fit ?? "shrink",
    charSpacing: options.charSpacing,
    isTextBox: true,
    paraSpaceAfterPt: options.paraSpaceAfterPt,
    bullet: options.bullet,
    italic: options.italic,
    transparency: options.transparency,
  });
}

function shape(slide, type, x, y, w, h, options = {}) {
  slide.addShape(type, {
    x,
    y,
    w,
    h,
    rectRadius: options.rectRadius,
    fill: options.fill ?? { color: C.white },
    line: options.line ?? { color: C.slate200, width: 1 },
    shadow: options.shadow,
    rotate: options.rotate,
    transparency: options.transparency,
  });
}

function addPill(slide, label, x, y, w, options = {}) {
  shape(slide, S.roundRect, x, y, w, options.h ?? 0.3, {
    fill: { color: options.fill ?? C.blueSoft },
    line: { color: options.line ?? options.fill ?? C.blueSoft, width: 0.8 },
  });
  text(slide, label, x + 0.1, y + 0.01, w - 0.2, (options.h ?? 0.3) - 0.02, {
    fontSize: options.fontSize ?? 8.5,
    color: options.color ?? C.blueDark,
    bold: options.bold ?? true,
    align: "center",
  });
}

function addFooter(slide, section, slideNumber, dark = false) {
  const color = dark ? C.slate400 : C.slate500;
  text(slide, section.toUpperCase(), 0.58, 7.08, 4.3, 0.2, {
    fontSize: 7.3,
    color,
    bold: true,
    charSpacing: 1.3,
  });
  text(slide, "EDITABLE VECTOR · KO", 5.15, 7.08, 3.0, 0.2, {
    fontSize: 7.3,
    color,
    bold: true,
    align: "center",
    charSpacing: 0.7,
  });
  text(slide, String(slideNumber).padStart(2, "0"), 12.1, 7.05, 0.62, 0.23, {
    fontSize: 8.5,
    color,
    bold: true,
    align: "right",
  });
}

function addSlide({ title, subtitle, section, kind = "content", dark = false, notes = "" }) {
  const slide = pptx.addSlide();
  const number = slides.length + 1;
  slide.background = { color: dark ? C.ink : C.paper };
  slides.push({ number, title, section, kind });

  if (kind === "content") {
    addPill(slide, section, 0.58, 0.38, Math.max(1.2, Math.min(2.6, section.length * 0.12 + 0.7)), {
      fill: dark ? C.slate800 : C.blueSoft,
      line: dark ? C.slate800 : C.blueSoft,
      color: dark ? C.cyan : C.blueDark,
    });
    text(slide, title, 0.58, 0.8, 8.9, 0.55, {
      fontSize: 25,
      color: dark ? C.white : C.ink,
      bold: true,
    });
    if (subtitle) {
      text(slide, subtitle, 9.05, 0.85, 3.7, 0.42, {
        fontSize: 9.4,
        color: dark ? C.slate300 : C.slate500,
        align: "right",
        valign: "top",
      });
    }
    shape(slide, S.line, 0.58, 1.43, 12.15, 0, {
      fill: { color: dark ? C.slate800 : C.slate200 },
      line: { color: dark ? C.slate800 : C.slate200, width: 1 },
    });
  }

  addFooter(slide, section, number, dark);
  if (notes) slide.addNotes(notes);
  return slide;
}

function addSectionSlide({ eyebrow, title, body, section, index, accent = C.cyan }) {
  const slide = addSlide({
    title,
    section,
    kind: "section",
    dark: true,
    notes: `${title}\n\n${body}\n\n이 슬라이드는 섹션 구분용이다. 제목과 설명을 교체해 재사용한다.`,
  });
  const number = slides.length;
  shape(slide, S.ellipse, 8.65, -1.1, 5.8, 5.8, {
    fill: { color: accent, transparency: 78 },
    line: { color: accent, transparency: 100, width: 0 },
  });
  shape(slide, S.ellipse, 10.0, 3.9, 3.7, 3.7, {
    fill: { color: C.violet, transparency: 86 },
    line: { color: C.violet, transparency: 100, width: 0 },
  });
  addPill(slide, eyebrow, 0.72, 0.7, Math.max(1.4, eyebrow.length * 0.13 + 0.7), {
    fill: C.slate800,
    line: C.slate800,
    color: accent,
  });
  text(slide, String(index).padStart(2, "0"), 0.72, 1.48, 1.0, 0.64, {
    fontSize: 30,
    color: accent,
    bold: true,
  });
  text(slide, title, 1.85, 1.42, 9.8, 1.4, {
    fontSize: 34,
    color: C.white,
    bold: true,
    valign: "top",
  });
  text(slide, body, 1.88, 3.13, 7.65, 1.25, {
    fontSize: 15,
    color: C.slate300,
    valign: "top",
  });
  shape(slide, S.line, 1.88, 4.83, 7.05, 0, {
    fill: { color: C.slate700 },
    line: { color: C.slate700, width: 1.2 },
  });
  text(slide, "조합 원칙", 1.88, 5.08, 1.3, 0.3, {
    fontSize: 9,
    color: accent,
    bold: true,
  });
  text(slide, "핵심 메시지 1개 · 흐름 방향 1개 · 예외 경로는 별도 색상", 3.08, 5.02, 6.2, 0.4, {
    fontSize: 11,
    color: C.slate300,
  });
  addFooter(slide, section, number, true);
  return slide;
}

function addCard(
  slide,
  { x, y, w, h, title, body, accent = C.blue, fill = C.white, tag, icon, dark = false },
) {
  shape(slide, S.roundRect, x, y, w, h, {
    fill: { color: fill },
    line: { color: dark ? C.slate700 : C.slate200, width: 0.8 },
    shadow: dark ? undefined : shadow,
  });
  shape(slide, S.roundRect, x, y, 0.08, h, {
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });
  if (icon) {
    shape(slide, S.roundRect, x + 0.24, y + 0.22, 0.47, 0.47, {
      fill: { color: accent, transparency: dark ? 70 : 84 },
      line: { color: accent, transparency: 100, width: 0 },
    });
    text(slide, icon, x + 0.27, y + 0.23, 0.41, 0.42, {
      fontSize: 10.2,
      color: accent,
      bold: true,
      align: "center",
    });
  }
  const titleX = icon ? x + 0.84 : x + 0.28;
  text(slide, title, titleX, y + 0.2, w - (titleX - x) - 0.22, 0.37, {
    fontSize: 12.3,
    color: dark ? C.white : C.ink,
    bold: true,
  });
  if (tag) {
    addPill(slide, tag, x + w - 0.93, y + 0.2, 0.7, {
      h: 0.24,
      fontSize: 7.2,
      fill: dark ? C.slate700 : C.slate100,
      line: dark ? C.slate700 : C.slate100,
      color: dark ? C.slate300 : C.slate600,
    });
  }
  text(slide, body, x + 0.28, y + 0.77, w - 0.56, h - 0.96, {
    fontSize: 9.3,
    color: dark ? C.slate300 : C.slate600,
    valign: "top",
  });
}

function addNode(
  slide,
  {
    x,
    y,
    w = 1.75,
    h = 0.95,
    label,
    meta,
    icon = "API",
    accent = C.blue,
    fill = C.white,
    dashed = false,
  },
) {
  shape(slide, S.roundRect, x, y, w, h, {
    fill: { color: fill },
    line: { color: accent, width: 1.25, dash: dashed ? "dash" : "solid" },
    shadow,
  });
  shape(slide, S.roundRect, x + 0.17, y + 0.2, 0.49, 0.49, {
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });
  text(slide, icon, x + 0.2, y + 0.21, 0.43, 0.45, {
    fontSize: icon.length > 3 ? 7.2 : 9,
    color: C.white,
    bold: true,
    align: "center",
  });
  text(slide, label, x + 0.78, y + 0.15, w - 0.92, 0.33, {
    fontSize: 10.5,
    color: C.ink,
    bold: true,
  });
  if (meta) {
    text(slide, meta, x + 0.78, y + 0.5, w - 0.92, 0.25, {
      fontSize: 7.4,
      color: C.slate500,
    });
  }
}

function addConnector(
  slide,
  {
    x,
    y,
    w,
    h = 0,
    color = C.blue,
    width = 1.6,
    dash = "solid",
    label,
    labelX,
    labelY,
    labelW = 1.5,
    beginArrowType = "none",
    endArrowType = "triangle",
  },
) {
  let shapeType = S.line;
  let normalizedX = x;
  let normalizedY = y;
  let normalizedW = w;
  let normalizedH = h;
  let normalizedBeginArrowType = beginArrowType;
  let normalizedEndArrowType = endArrowType;

  if (w < 0 && h === 0) {
    normalizedX = x + w;
    normalizedW = -w;
    normalizedBeginArrowType = endArrowType;
    normalizedEndArrowType = beginArrowType;
  } else if (h < 0 && w === 0) {
    normalizedY = y + h;
    normalizedH = -h;
    normalizedBeginArrowType = endArrowType;
    normalizedEndArrowType = beginArrowType;
  } else if (h < 0 && w > 0) {
    shapeType = S.lineInv;
    normalizedY = y + h;
    normalizedH = -h;
  }

  slide.addShape(shapeType, {
    x: normalizedX,
    y: normalizedY,
    w: normalizedW,
    h: normalizedH,
    line: {
      color,
      width,
      dash,
      beginArrowType: normalizedBeginArrowType,
      endArrowType: normalizedEndArrowType,
    },
  });
  if (label) {
    shape(slide, S.roundRect, labelX ?? x + w / 2 - labelW / 2, labelY ?? y - 0.18, labelW, 0.25, {
      fill: { color: C.paper },
      line: { color: C.paper, transparency: 100, width: 0 },
    });
    text(
      slide,
      label,
      labelX ?? x + w / 2 - labelW / 2,
      (labelY ?? y - 0.18) + 0.01,
      labelW,
      0.22,
      {
        fontSize: 7.4,
        color,
        bold: true,
        align: "center",
      },
    );
  }
}

function addStep(slide, { x, y, w, index, title, body, accent = C.blue }) {
  shape(slide, S.roundRect, x, y, w, 1.02, {
    fill: { color: C.white },
    line: { color: C.slate200, width: 0.8 },
  });
  shape(slide, S.ellipse, x + 0.2, y + 0.23, 0.53, 0.53, {
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });
  text(slide, String(index).padStart(2, "0"), x + 0.2, y + 0.24, 0.53, 0.48, {
    fontSize: 9,
    color: C.white,
    bold: true,
    align: "center",
  });
  text(slide, title, x + 0.88, y + 0.15, w - 1.05, 0.3, {
    fontSize: 10.3,
    color: C.ink,
    bold: true,
  });
  text(slide, body, x + 0.88, y + 0.48, w - 1.05, 0.36, {
    fontSize: 7.7,
    color: C.slate500,
    valign: "top",
  });
}

function addLane(slide, { x, y, w, h, label, accent = C.blue, fill = C.white }) {
  shape(slide, S.roundRect, x, y, w, h, {
    fill: { color: fill },
    line: { color: C.slate200, width: 0.8 },
  });
  shape(slide, S.roundRect, x, y, 1.12, h, {
    fill: { color: accent, transparency: 88 },
    line: { color: accent, transparency: 100, width: 0 },
  });
  text(slide, label, x + 0.14, y + 0.2, 0.84, h - 0.4, {
    fontSize: 8.5,
    color: accent,
    bold: true,
    align: "center",
  });
}

function addMetric(slide, { x, y, w, value, label, accent = C.blue }) {
  shape(slide, S.roundRect, x, y, w, 0.86, {
    fill: { color: C.white },
    line: { color: C.slate200, width: 0.8 },
  });
  text(slide, value, x + 0.18, y + 0.12, w - 0.36, 0.33, {
    fontSize: 17,
    color: accent,
    bold: true,
  });
  text(slide, label, x + 0.18, y + 0.49, w - 0.36, 0.2, {
    fontSize: 7.8,
    color: C.slate500,
    bold: true,
  });
}

function addDecisionTable(slide, { x, y, widths, rows, headerFill = C.slate900 }) {
  const rowH = 0.52;
  let cy = y;
  rows.forEach((row, rowIndex) => {
    let cx = x;
    row.forEach((cell, cellIndex) => {
      const fill = rowIndex === 0 ? headerFill : rowIndex % 2 === 0 ? C.slate100 : C.white;
      shape(slide, S.rect, cx, cy, widths[cellIndex], rowH, {
        fill: { color: fill },
        line: { color: rowIndex === 0 ? headerFill : C.slate200, width: 0.7 },
      });
      text(slide, cell, cx + 0.1, cy + 0.03, widths[cellIndex] - 0.2, rowH - 0.06, {
        fontSize: rowIndex === 0 ? 8.4 : 8.1,
        color: rowIndex === 0 ? C.white : C.slate700,
        bold: rowIndex === 0 || cell.startsWith("권장"),
        align: cellIndex === 0 ? "left" : "center",
      });
      cx += widths[cellIndex];
    });
    cy += rowH;
  });
}

// 01 · 표지
{
  const slide = addSlide({
    title: "IT 아키텍처를 설명하는 가장 깨끗한 방법",
    section: "Architecture kit",
    kind: "cover",
    dark: true,
    notes:
      "발표 목적: 이슈 #44가 EIAM의 빌드·호스팅·릴리스 신뢰성을 어떻게 높였는지 설명하고, 일반적인 WAS/서버 통신 슬라이드로 확장할 수 있는 편집 가능한 구성 요소를 제공한다.",
  });
  shape(slide, S.ellipse, 8.85, -1.75, 6.25, 6.25, {
    fill: { color: C.blue, transparency: 66 },
    line: { color: C.blue, transparency: 100, width: 0 },
  });
  shape(slide, S.ellipse, 10.15, 3.7, 4.1, 4.1, {
    fill: { color: C.cyan, transparency: 78 },
    line: { color: C.cyan, transparency: 100, width: 0 },
  });
  shape(slide, S.ellipse, 7.7, 4.6, 2.3, 2.3, {
    fill: { color: C.violet, transparency: 83 },
    line: { color: C.violet, transparency: 100, width: 0 },
  });
  addPill(slide, "ISSUE #44 · PRODUCTION RELIABILITY", 0.72, 0.64, 2.9, {
    fill: C.slate800,
    line: C.slate800,
    color: C.cyan,
  });
  text(slide, "IT 아키텍처를\n설명하는 가장 깨끗한 방법", 0.72, 1.4, 8.8, 1.9, {
    fontSize: 31,
    color: C.white,
    bold: true,
    valign: "top",
  });
  text(
    slide,
    "EIAM의 실제 정적 빌드·검증·배포 구조 + 조합 가능한 WAS·서버 통신 참조 아키텍처",
    0.76,
    3.62,
    7.4,
    0.76,
    {
      fontSize: 14,
      color: C.slate300,
      valign: "top",
    },
  );
  const labels = [
    ["01", "편집 가능한 벡터"],
    ["32", "상세 슬라이드"],
    ["KO", "한글 최적화"],
  ];
  labels.forEach(([value, label], index) => {
    const x = 0.76 + index * 2.12;
    text(slide, value, x, 5.3, 0.7, 0.4, {
      fontSize: 17,
      color: index === 1 ? C.cyan : C.blueSoft,
      bold: true,
    });
    text(slide, label, x + 0.7, 5.32, 1.25, 0.32, {
      fontSize: 8.5,
      color: C.slate400,
      bold: true,
    });
  });
  text(slide, "Everything Is A Markdown", 0.76, 6.45, 3.4, 0.3, {
    fontSize: 10,
    color: C.slate300,
    bold: true,
  });
}

// 02 · 사용법
{
  const slide = addSlide({
    title: "이 덱을 조합하는 방법",
    subtitle: "슬라이드 전체를 복제한 뒤 메시지와 노드만 교체한다.",
    section: "사용 가이드",
    notes:
      "추천 조합: 표지 → 요약 → 시스템 컨텍스트 → 핵심 흐름 1~2장 → 장애/운영 → 의사결정 → 로드맵. 실제 EIAM 섹션과 선택형 WAS 예시를 섞을 때는 반드시 ‘현재’와 ‘목표/예시’를 라벨로 구분한다.",
  });
  const stages = [
    {
      n: 1,
      title: "목적 선택",
      body: "보고·제안·설계 리뷰 중\n한 가지 목적만 먼저 정한다.",
      color: C.blue,
    },
    {
      n: 2,
      title: "기준 구조 선택",
      body: "실제 EIAM 또는 선택형 WAS\n중 기준 아키텍처를 고른다.",
      color: C.cyan,
    },
    {
      n: 3,
      title: "흐름 추가",
      body: "동기·비동기·실패 경로를\n선 의미에 맞춰 연결한다.",
      color: C.emerald,
    },
    {
      n: 4,
      title: "운영 맥락 보강",
      body: "보안·HA·관측성·롤백을\n필요한 만큼만 붙인다.",
      color: C.amber,
    },
  ];
  stages.forEach((item, index) => {
    const x = 0.58 + index * 3.08;
    addCard(slide, {
      x,
      y: 1.75,
      w: 2.75,
      h: 1.62,
      title: item.title,
      body: item.body,
      accent: item.color,
      icon: String(item.n).padStart(2, "0"),
    });
    if (index < stages.length - 1) {
      addConnector(slide, {
        x: x + 2.75,
        y: 2.55,
        w: 0.33,
        color: C.slate300,
        width: 1.2,
      });
    }
  });
  shape(slide, S.roundRect, 0.58, 3.78, 12.15, 2.57, {
    fill: { color: C.navy },
    line: { color: C.navy, width: 0 },
  });
  text(slide, "추천 발표 흐름", 0.92, 4.04, 1.7, 0.32, {
    fontSize: 10.5,
    color: C.cyan,
    bold: true,
  });
  const flow = [
    ["WHY", "문제·목표"],
    ["WHAT", "시스템 컨텍스트"],
    ["HOW", "핵심 처리 흐름"],
    ["SAFE", "보안·실패·롤백"],
    ["NEXT", "결정·로드맵"],
  ];
  flow.forEach(([key, label], index) => {
    const x = 0.92 + index * 2.28;
    shape(slide, S.roundRect, x, 4.65, 1.85, 0.9, {
      fill: { color: index === 2 ? C.blue : C.slate800 },
      line: { color: index === 2 ? C.blue : C.slate700, width: 0.8 },
    });
    text(slide, key, x + 0.16, 4.78, 0.55, 0.24, {
      fontSize: 8.5,
      color: index === 2 ? C.white : C.cyan,
      bold: true,
    });
    text(slide, label, x + 0.16, 5.05, 1.5, 0.27, {
      fontSize: 9.2,
      color: C.white,
      bold: true,
    });
    if (index < flow.length - 1) {
      addConnector(slide, {
        x: x + 1.85,
        y: 5.1,
        w: 0.43,
        color: C.slate500,
        width: 1.2,
      });
    }
  });
  addPill(slide, "현재 구조", 10.48, 5.85, 0.9, {
    fill: C.emeraldSoft,
    line: C.emeraldSoft,
    color: "047857",
  });
  addPill(slide, "선택형 예시", 11.48, 5.85, 1.02, {
    fill: C.amberSoft,
    line: C.amberSoft,
    color: "92400E",
  });
}

// 03 · 디자인 토큰
{
  const slide = addSlide({
    title: "모던 아키텍처 디자인 시스템",
    subtitle: "색은 의미, 간격은 계층, 선은 통신 방식을 나타낸다.",
    section: "컴포넌트",
    notes:
      "Noto Sans CJK KR을 기본 글꼴로 사용한다. 조직 표준 폰트가 있으면 전체 선택 후 글꼴만 바꾼다. 색상은 장식이 아니라 의미에 연결한다.",
  });
  text(slide, "COLOR TOKENS", 0.62, 1.72, 2.2, 0.3, {
    fontSize: 8.5,
    color: C.slate500,
    bold: true,
    charSpacing: 1.1,
  });
  const colors = [
    ["PRIMARY", C.blue, "#2563EB", "주 흐름"],
    ["ASYNC", C.violet, "#7C3AED", "비동기"],
    ["SUCCESS", C.emerald, "#10B981", "정상·승인"],
    ["ATTENTION", C.amber, "#F59E0B", "주의·대기"],
    ["FAILURE", C.rose, "#F43F5E", "실패·차단"],
    ["NEUTRAL", C.slate700, "#334155", "경계·설명"],
  ];
  colors.forEach(([name, color, hex, use], index) => {
    const x = 0.62 + index * 2.02;
    shape(slide, S.roundRect, x, 2.08, 1.76, 1.1, {
      fill: { color },
      line: { color, width: 0 },
    });
    text(slide, name, x + 0.15, 2.2, 1.45, 0.26, {
      fontSize: 8,
      color: C.white,
      bold: true,
    });
    text(slide, hex, x + 0.15, 2.54, 1.45, 0.22, {
      fontSize: 8.5,
      color: C.white,
      fontFace: MONO,
    });
    text(slide, use, x + 0.15, 2.82, 1.45, 0.2, {
      fontSize: 7.6,
      color: C.white,
      bold: true,
    });
  });
  const specs = [
    {
      title: "타이포그래피",
      body: "H1 25–34 pt · H2 12–16 pt\n본문 9–12 pt · 캡션 7–8 pt\n한 장에 핵심 문장 1개",
      icon: "Aa",
      accent: C.blue,
    },
    {
      title: "8pt 간격 리듬",
      body: "바깥 여백 0.58 in\n카드 간격 0.24–0.32 in\n내부 여백 0.18–0.28 in",
      icon: "8",
      accent: C.cyan,
    },
    {
      title: "계층 깊이",
      body: "배경 → 레인 → 노드 → 상태\n최대 4단계까지만 사용\n테두리는 0.8–1.25 pt",
      icon: "L4",
      accent: C.violet,
    },
  ];
  specs.forEach((item, index) => {
    addCard(slide, {
      x: 0.62 + index * 4.05,
      y: 3.62,
      w: 3.78,
      h: 1.58,
      ...item,
    });
  });
  shape(slide, S.roundRect, 0.62, 5.58, 12.05, 0.72, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.8 },
  });
  text(slide, "문장 규칙", 0.88, 5.77, 1.0, 0.25, {
    fontSize: 9,
    color: C.blueDark,
    bold: true,
  });
  text(
    slide,
    "노드 이름은 명사형 · 선 라벨은 동사형/프로토콜 · 상태는 완료형 · 예외는 ‘조건 → 결과’로 쓴다.",
    1.86,
    5.72,
    10.3,
    0.34,
    {
      fontSize: 10.3,
      color: C.slate700,
    },
  );
}

// 04 · 인프라 노드 카탈로그
{
  const slide = addSlide({
    title: "컴포넌트 카탈로그 ① 인프라·서비스 노드",
    subtitle: "노드를 복제하고 약어·이름·기술만 교체한다.",
    section: "컴포넌트",
    notes:
      "각 노드는 배경 카드, 색상 아이콘, 이름, 기술 메타데이터로 구성된다. 서비스 역할에 따라 색을 바꾸되 같은 슬라이드에서는 같은 역할에 같은 색을 쓴다.",
  });
  const nodes = [
    ["WEB", "사용자 채널", "Web · Mobile", C.blue],
    ["CDN", "Edge / CDN", "Cloudflare", C.cyan],
    ["LB", "Load Balancer", "L7 · TLS", C.violet],
    ["WAS", "Application", "Bun · JVM", C.blue],
    ["API", "API Gateway", "REST · gRPC", C.emerald],
    ["DB", "Database", "PostgreSQL", C.cyan],
    ["MQ", "Message Broker", "Kafka · SQS", C.violet],
    ["OBJ", "Object Storage", "R2 · S3", C.amber],
    ["EXT", "External System", "SaaS · Partner", C.rose],
    ["JOB", "Batch / Worker", "Cron · Queue", C.emerald],
    ["SEC", "Identity / WAF", "OIDC · Policy", C.rose],
    ["OBS", "Observability", "Logs · Metrics", C.amber],
  ];
  nodes.forEach(([icon, label, meta, accent], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    addNode(slide, {
      x: 0.62 + col * 3.04,
      y: 1.76 + row * 1.38,
      w: 2.73,
      h: 1.02,
      icon,
      label,
      meta,
      accent,
    });
  });
  shape(slide, S.roundRect, 0.62, 5.98, 12.05, 0.46, {
    fill: { color: C.blueSoft },
    line: { color: C.blueSoft, width: 0 },
  });
  text(
    slide,
    "TIP  현재 시스템은 실선 · 목표/후보 시스템은 점선 · 외부 소유 시스템은 Rose 테두리로 구분",
    0.88,
    6.08,
    11.55,
    0.22,
    { fontSize: 8.8, color: C.blueDark, bold: true },
  );
}

// 05 · 코드·데이터·운영 컴포넌트
{
  const slide = addSlide({
    title: "컴포넌트 카탈로그 ② 코드·데이터·운영",
    subtitle: "소스 구조, 데이터 이동, 운영 상태를 같은 시각 언어로 묶는다.",
    section: "컴포넌트",
    notes:
      "소스 구조 페이지에는 폴더 트리와 모듈 책임 카드를 함께 사용한다. 운영 페이지에는 숫자보다 상태와 임계치를 우선 표시한다.",
  });
  addCard(slide, {
    x: 0.62,
    y: 1.75,
    w: 3.75,
    h: 2.05,
    title: "소스 트리",
    body: "",
    accent: C.blue,
    icon: "SRC",
  });
  const treeLines = [
    ["src/", C.ink, true],
    ["├─ build/   빌드 오케스트레이션", C.blue, false],
    ["├─ runtime/ 브라우저 컨트롤러", C.violet, false],
    ["├─ cli.ts   명령 진입점", C.slate600, false],
    ["└─ config.ts 설정 검증", C.slate600, false],
  ];
  treeLines.forEach(([line, color, bold], index) => {
    text(slide, line, 0.93, 2.47 + index * 0.23, 3.02, 0.21, {
      fontSize: 7.7,
      color,
      bold,
      fontFace: MONO,
    });
  });
  addCard(slide, {
    x: 4.64,
    y: 1.75,
    w: 3.75,
    h: 2.05,
    title: "데이터 오브젝트",
    body: "Manifest\n문서 그래프 · 경로 · 메타데이터\n\nBuild Cache\n소스·렌더링·출력 해시",
    accent: C.cyan,
    icon: "JSON",
  });
  addCard(slide, {
    x: 8.66,
    y: 1.75,
    w: 4.01,
    h: 2.05,
    title: "운영 상태",
    body: "SLO  정상 범위\nWARN  임계치 접근\nFAIL  배포 차단\nROLLBACK  이전 정상본 복구",
    accent: C.amber,
    icon: "OPS",
  });
  const states = [
    ["정상", "검증 통과", C.emerald, C.emeraldSoft],
    ["주의", "재시도/대기", C.amber, C.amberSoft],
    ["실패", "게이트 차단", C.rose, C.roseSoft],
    ["복구", "이전 버전", C.violet, C.violetSoft],
  ];
  states.forEach(([label, meta, accent, fill], index) => {
    const x = 0.62 + index * 3.04;
    shape(slide, S.roundRect, x, 4.22, 2.73, 0.94, {
      fill: { color: fill },
      line: { color: accent, width: 1 },
    });
    shape(slide, S.ellipse, x + 0.2, 4.51, 0.25, 0.25, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    text(slide, label, x + 0.58, 4.4, 0.66, 0.26, {
      fontSize: 10.3,
      color: C.ink,
      bold: true,
    });
    text(slide, meta, x + 1.17, 4.41, 1.34, 0.24, {
      fontSize: 8,
      color: C.slate600,
      align: "right",
    });
  });
  addDecisionTable(slide, {
    x: 0.62,
    y: 5.5,
    widths: [2.05, 2.48, 2.48, 2.48, 2.56],
    rows: [
      ["표현 목적", "구조", "동작", "상태", "의사결정"],
      ["추천 요소", "트리·모듈 카드", "흐름·시퀀스", "배지·임계치", "비교표·ADR"],
    ],
  });
}

// 06 · 연결선
{
  const slide = addSlide({
    title: "연결선의 의미를 먼저 고정한다",
    subtitle: "선 스타일이 통신 계약과 실패 의미를 대신 설명한다.",
    section: "컴포넌트",
    notes:
      "동기 호출, 비동기 이벤트, 데이터 복제, 실패/보상, 신뢰 경계를 서로 다른 선으로 표현한다. 한 장에서 선 스타일은 최대 네 종류를 권장한다.",
  });
  const rows = [
    {
      y: 1.85,
      color: C.blue,
      dash: "solid",
      width: 2,
      title: "동기 요청/응답",
      body: "HTTP · REST · gRPC · timeout 필수",
      label: "POST /orders",
    },
    {
      y: 2.75,
      color: C.violet,
      dash: "dash",
      width: 1.8,
      title: "비동기 이벤트",
      body: "at-least-once · idempotency · DLQ",
      label: "OrderCreated",
    },
    {
      y: 3.65,
      color: C.cyan,
      dash: "solid",
      width: 3,
      title: "데이터/아티팩트",
      body: "파일 · 빌드 산출물 · 복제",
      label: "validated artifact",
    },
    {
      y: 4.55,
      color: C.rose,
      dash: "dash",
      width: 1.8,
      title: "실패/보상 경로",
      body: "rollback · retry · circuit open",
      label: "restore previous",
    },
    {
      y: 5.45,
      color: C.slate500,
      dash: "dot",
      width: 1.2,
      title: "관측/제어 신호",
      body: "logs · metrics · policy decision",
      label: "trace + alert",
    },
  ];
  rows.forEach((row) => {
    shape(slide, S.roundRect, 0.62, row.y - 0.14, 12.05, 0.68, {
      fill: { color: C.white },
      line: { color: C.slate200, width: 0.7 },
    });
    text(slide, row.title, 0.9, row.y, 1.72, 0.25, {
      fontSize: 9.7,
      color: C.ink,
      bold: true,
    });
    text(slide, row.body, 2.55, row.y, 2.42, 0.25, {
      fontSize: 8.2,
      color: C.slate500,
    });
    shape(slide, S.ellipse, 5.25, row.y - 0.04, 0.31, 0.31, {
      fill: { color: row.color },
      line: { color: row.color, width: 0 },
    });
    shape(slide, S.ellipse, 11.98, row.y - 0.04, 0.31, 0.31, {
      fill: { color: row.color },
      line: { color: row.color, width: 0 },
    });
    addConnector(slide, {
      x: 5.55,
      y: row.y + 0.12,
      w: 6.43,
      color: row.color,
      dash: row.dash,
      width: row.width,
      label: row.label,
      labelX: 7.74,
      labelY: row.y - 0.1,
      labelW: 2.15,
    });
  });
  shape(slide, S.roundRect, 9.68, 1.22, 2.99, 0.36, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.7 },
  });
  text(slide, "→ 방향 · 라벨 · 프로토콜 · 실패 조건", 9.84, 1.29, 2.66, 0.18, {
    fontSize: 7.6,
    color: C.slate600,
    bold: true,
    align: "center",
  });
}

// 07 · 페이지 템플릿
{
  const slide = addSlide({
    title: "페이지 템플릿 카탈로그",
    subtitle: "목적에 맞는 레이아웃을 고르면 정보 밀도가 자동으로 정리된다.",
    section: "컴포넌트",
    notes:
      "각 미니어처는 뒤쪽 실전 슬라이드의 레이아웃을 축약한 것이다. 새 슬라이드를 만들 때 가까운 예제를 복제하고 요소를 삭제해서 사용한다.",
  });
  const templates = [
    ["01", "Executive", "핵심 요약·지표", C.blue],
    ["02", "Context", "시스템 경계·사용자", C.cyan],
    ["03", "Flow", "처리 단계·게이트", C.emerald],
    ["04", "Sequence", "시간순 호출", C.violet],
    ["05", "Structure", "소스·모듈 책임", C.blue],
    ["06", "Failure", "장애·복구 경로", C.rose],
    ["07", "Decision", "대안·트레이드오프", C.amber],
    ["08", "Roadmap", "단계·완료 조건", C.emerald],
  ];
  templates.forEach(([number, name, use, accent], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 0.62 + col * 3.04;
    const y = 1.74 + row * 2.38;
    shape(slide, S.roundRect, x, y, 2.73, 1.64, {
      fill: { color: C.white },
      line: { color: C.slate200, width: 0.8 },
      shadow,
    });
    shape(slide, S.rect, x + 0.16, y + 0.16, 2.41, 0.19, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    shape(slide, S.roundRect, x + 0.16, y + 0.52, 0.68, 0.68, {
      fill: { color: accent, transparency: 82 },
      line: { color: accent, width: 0.8 },
    });
    shape(slide, S.roundRect, x + 0.96, y + 0.52, 1.61, 0.19, {
      fill: { color: C.slate200 },
      line: { color: C.slate200, width: 0 },
    });
    shape(slide, S.roundRect, x + 0.96, y + 0.82, 1.22, 0.15, {
      fill: { color: C.slate100 },
      line: { color: C.slate100, width: 0 },
    });
    text(slide, number, x + 0.22, y + 0.63, 0.56, 0.3, {
      fontSize: 9,
      color: accent,
      bold: true,
      align: "center",
    });
    text(slide, name, x + 0.18, y + 1.27, 1.15, 0.22, {
      fontSize: 8.7,
      color: C.ink,
      bold: true,
    });
    text(slide, use, x + 1.15, y + 1.27, 1.36, 0.22, {
      fontSize: 7.5,
      color: C.slate500,
      align: "right",
    });
  });
  shape(slide, S.roundRect, 0.62, 6.45, 12.05, 0.36, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.7 },
  });
  text(
    slide,
    "권장 순서: Executive → Context → Flow/Sequence → Failure → Decision → Roadmap",
    0.82,
    6.52,
    11.65,
    0.2,
    { fontSize: 8.3, color: C.slate600, bold: true, align: "center" },
  );
}

// 08 · 실제 아키텍처 섹션
addSectionSlide({
  eyebrow: "CURRENT · EIAM",
  title: "이슈 #44의 실제 아키텍처",
  body: "EIAM은 Markdown을 정적 사이트로 변환하는 Bun 기반 생성기다. 운영 시점에 요청을 처리하는 WAS는 없으며, 신뢰성은 빌드 트랜잭션·검증 게이트·불변 아티팩트·Cloudflare Pages 배포 계약에서 확보한다.",
  section: "EIAM 실제 구조",
  index: 1,
  accent: C.cyan,
});

// 09 · Executive summary
{
  const slide = addSlide({
    title: "신뢰성은 ‘빌드 → 검증 → 전달’의 계약으로 만든다",
    subtitle: "Issue #44 · [epic][deployment] Make builds, hosting, and releases reliable",
    section: "EIAM 실제 구조",
    notes:
      "핵심 요약: 실패한 빌드는 마지막 정상 출력을 보존한다. 도구·런타임 의존성을 고정한다. 가변 콘텐츠와 해시 자산의 캐시 정책을 분리한다. 릴리스와 사이트 배포를 별도 책임으로 운영한다.",
  });
  const outcomes = [
    {
      title: "Atomic output",
      body: "staging에서 완성한 뒤 rename으로 교체\n실패 시 기존 dist 유지",
      accent: C.blue,
      icon: "TX",
      tag: "BUILD",
    },
    {
      title: "Reproducible runtime",
      body: "Bun 버전·잠금 파일·Mermaid 런타임 고정\n동일 입력은 동일 출력",
      accent: C.cyan,
      icon: "PIN",
      tag: "RUNTIME",
    },
    {
      title: "Validation gate",
      body: "배포 전에 그래프·참조·캐시·재현성 검증\n실패한 산출물은 전달 금지",
      accent: C.emerald,
      icon: "QA",
      tag: "GATE",
    },
    {
      title: "Separated delivery",
      body: "npm 패키지 릴리스와 사이트 배포 분리\n검증 job과 credential job 분리",
      accent: C.violet,
      icon: "CD",
      tag: "DELIVERY",
    },
  ];
  outcomes.forEach((item, index) => {
    addCard(slide, {
      x: 0.62 + (index % 2) * 6.08,
      y: 1.75 + Math.floor(index / 2) * 1.63,
      w: 5.76,
      h: 1.35,
      ...item,
    });
  });
  const metrics = [
    ["8", "병합된 세부 작업", C.blue],
    ["1", "단일 태그 릴리스 경로", C.violet],
    ["2", "배포 job 경계", C.cyan],
    ["0", "운영 시점 WAS", C.emerald],
  ];
  metrics.forEach(([value, label, accent], index) => {
    addMetric(slide, {
      x: 0.62 + index * 3.04,
      y: 5.22,
      w: 2.73,
      value,
      label,
      accent,
    });
  });
  shape(slide, S.roundRect, 0.62, 6.3, 12.05, 0.43, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(
    slide,
    "결론  EIAM의 ‘서버 아키텍처’는 요청 처리 서버가 아니라 검증된 정적 산출물을 안전하게 생성·전달하는 공급망 아키텍처다.",
    0.86,
    6.38,
    11.55,
    0.22,
    { fontSize: 8.8, color: C.white, bold: true, align: "center" },
  );
}

// 10 · 시스템 컨텍스트
{
  const slide = addSlide({
    title: "시스템 컨텍스트: 요청 경로에는 WAS가 없다",
    subtitle: "현재 구조 · Static Site Generator + Edge Hosting",
    section: "EIAM 실제 구조",
    notes:
      "사용자는 Cloudflare Pages가 제공하는 정적 HTML/JS/CSS/JSON을 읽는다. Bun/EIAM은 작성 또는 CI 빌드 시점에만 실행된다. 별도 API/WAS는 이 구조의 필수 요소가 아니다.",
  });
  const nodes = [
    { x: 0.68, w: 1.55, icon: "USR", label: "작성자", meta: "Markdown 편집", accent: C.blue },
    { x: 2.55, w: 1.75, icon: "VLT", label: "Vault", meta: "notes + config", accent: C.cyan },
    {
      x: 4.62,
      w: 1.75,
      icon: "CLI",
      label: "EIAM Build",
      meta: "Bun · CI/local",
      accent: C.violet,
    },
    {
      x: 6.69,
      w: 1.75,
      icon: "OUT",
      label: "Static Output",
      meta: "HTML · JS · JSON",
      accent: C.emerald,
    },
    { x: 8.76, w: 1.75, icon: "CDN", label: "Cloudflare", meta: "Pages · Edge", accent: C.cyan },
    { x: 10.83, w: 1.55, icon: "WEB", label: "독자", meta: "Browser", accent: C.blue },
  ];
  nodes.forEach((node) => {
    addNode(slide, {
      x: node.x,
      y: 3.0,
      w: node.w,
      h: 1.05,
      ...node,
    });
  });
  const arrows = [
    [2.23, 0.32, "commit", C.slate500],
    [4.3, 0.32, "checkout", C.slate500],
    [6.37, 0.32, "emit", C.emerald],
    [8.44, 0.32, "deploy", C.cyan],
    [10.51, 0.32, "HTTPS", C.blue],
  ];
  arrows.forEach(([x, w, label, color]) => {
    addConnector(slide, {
      x,
      y: 3.53,
      w,
      color,
      label,
      labelY: 3.26,
      labelW: 0.68,
    });
  });
  shape(slide, S.roundRect, 8.76, 1.74, 3.62, 0.92, {
    fill: { color: C.blueSoft },
    line: { color: C.blue, width: 1 },
  });
  text(slide, "정적 요청 / 응답", 9.01, 1.88, 3.12, 0.25, {
    fontSize: 10.8,
    color: C.blueDark,
    bold: true,
    align: "center",
  });
  text(slide, "GET → Edge cache/origin → static bytes", 9.01, 2.2, 3.12, 0.2, {
    fontSize: 7.7,
    color: C.slate600,
    align: "center",
  });
  shape(slide, S.roundRect, 0.68, 4.82, 8.68, 1.2, {
    fill: { color: C.white },
    line: { color: C.slate200, width: 0.8 },
  });
  addPill(slide, "BUILD TIME", 0.92, 5.03, 1.12, {
    fill: C.violetSoft,
    line: C.violetSoft,
    color: C.violet,
  });
  text(
    slide,
    "Bun 프로세스가 문서를 읽고 그래프·HTML·런타임 자산·헤더를 생성한 뒤 종료",
    2.21,
    4.96,
    6.75,
    0.39,
    { fontSize: 10, color: C.slate700, bold: true },
  );
  text(
    slide,
    "CI 실패는 사용자 트래픽에 직접 전파되지 않으며, 마지막 정상 배포가 계속 서비스된다.",
    2.21,
    5.41,
    6.75,
    0.32,
    { fontSize: 8.4, color: C.slate500 },
  );
  shape(slide, S.roundRect, 9.64, 4.82, 3.03, 1.2, {
    fill: { color: C.emeraldSoft },
    line: { color: C.emerald, width: 0.9 },
  });
  text(slide, "RUNTIME", 9.92, 5.0, 0.78, 0.24, {
    fontSize: 8.5,
    color: "047857",
    bold: true,
  });
  text(slide, "WAS / DB / Queue", 9.92, 5.28, 2.48, 0.3, {
    fontSize: 12,
    color: C.ink,
    bold: true,
  });
  text(slide, "필수 구성요소 아님", 9.92, 5.62, 2.48, 0.22, {
    fontSize: 8.2,
    color: "047857",
    bold: true,
  });
}

// 11 · 배포 토폴로지
{
  const slide = addSlide({
    title: "책임 경계를 나누면 배포 위험이 작아진다",
    subtitle: "Generator repo · Vault repo · Cloud edge · Reader",
    section: "EIAM 실제 구조",
    notes:
      "생성기 저장소는 npm 패키지와 재사용 워크플로를 제공한다. Vault 저장소는 콘텐츠, 설정, Cloudflare 프로젝트와 자격 증명을 소유한다. 빌드 job은 자격 증명을 읽지 않는다.",
  });
  const zones = [
    { x: 0.62, w: 2.85, title: "① Generator repo", color: C.violet, fill: C.violetSoft },
    { x: 3.69, w: 4.38, title: "② Vault repo / CI", color: C.blue, fill: C.blueSoft },
    { x: 8.29, w: 2.48, title: "③ Cloud edge", color: C.cyan, fill: C.cyanSoft },
    { x: 10.99, w: 1.68, title: "④ Reader", color: C.emerald, fill: C.emeraldSoft },
  ];
  zones.forEach((zone) => {
    shape(slide, S.roundRect, zone.x, 1.72, zone.w, 4.5, {
      fill: { color: zone.fill, transparency: 58 },
      line: { color: zone.color, width: 1, dash: "dash" },
    });
    text(slide, zone.title, zone.x + 0.18, 1.88, zone.w - 0.36, 0.28, {
      fontSize: 9.2,
      color: zone.color,
      bold: true,
      align: "center",
    });
  });
  addNode(slide, {
    x: 0.9,
    y: 2.46,
    w: 2.29,
    icon: "NPM",
    label: "EIAM package",
    meta: "exact version",
    accent: C.violet,
  });
  addNode(slide, {
    x: 0.9,
    y: 4.23,
    w: 2.29,
    icon: "GHA",
    label: "Reusable workflow",
    meta: "commit/tag pinned",
    accent: C.violet,
  });
  addNode(slide, {
    x: 3.98,
    y: 2.32,
    w: 1.72,
    icon: "VLT",
    label: "Vault",
    meta: "content + config",
    accent: C.blue,
  });
  addNode(slide, {
    x: 5.98,
    y: 2.32,
    w: 1.8,
    icon: "VAL",
    label: "Build + Validate",
    meta: "NO SECRETS",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 4.83,
    y: 4.31,
    w: 1.98,
    icon: "ART",
    label: "Exact artifact",
    meta: "immutable hand-off",
    accent: C.cyan,
  });
  addNode(slide, {
    x: 8.55,
    y: 2.76,
    w: 1.97,
    icon: "DEP",
    label: "Pages Deploy",
    meta: "credentialed job",
    accent: C.cyan,
  });
  addNode(slide, {
    x: 11.12,
    y: 2.76,
    w: 1.39,
    icon: "WEB",
    label: "Web",
    meta: "HTTPS",
    accent: C.emerald,
  });
  addConnector(slide, {
    x: 3.18,
    y: 2.97,
    w: 0.8,
    color: C.violet,
    label: "install",
    labelY: 2.68,
    labelW: 0.7,
  });
  addConnector(slide, {
    x: 5.7,
    y: 2.85,
    w: 0.28,
    color: C.blue,
  });
  addConnector(slide, {
    x: 6.88,
    y: 3.38,
    w: 0,
    h: 0.93,
    color: C.emerald,
    label: "upload",
    labelX: 6.66,
    labelY: 3.75,
    labelW: 0.76,
  });
  addConnector(slide, {
    x: 6.81,
    y: 4.82,
    w: 1.74,
    color: C.cyan,
    width: 2.5,
    label: "download exact bytes",
    labelY: 4.47,
    labelW: 1.72,
  });
  addConnector(slide, {
    x: 10.52,
    y: 3.29,
    w: 0.6,
    color: C.cyan,
    label: "serve",
    labelY: 3.0,
    labelW: 0.68,
  });
  shape(slide, S.roundRect, 3.98, 5.55, 3.8, 0.42, {
    fill: { color: C.emeraldSoft },
    line: { color: C.emeraldSoft, width: 0 },
  });
  text(slide, "Cloudflare 자격 증명은 deploy job에서만 사용", 4.16, 5.64, 3.43, 0.2, {
    fontSize: 8.2,
    color: "047857",
    bold: true,
    align: "center",
  });
}

// 12 · 빌드 파이프라인
{
  const slide = addSlide({
    title: "빌드 파이프라인은 8개의 명시적 단계로 흐른다",
    subtitle: "src/build/pipeline.ts · buildSite(options)",
    section: "EIAM 실제 구조",
    notes:
      "buildSite는 저장소 상태 검사, 입력 읽기, 트랜잭션 시작, 출력 준비, 그래프 구성, 렌더링, 출력 기록, 커밋을 순서대로 조정한다. 예외는 abortBuildStorageTransaction으로 전달한다.",
  });
  const phases = [
    ["01", "Inspect", "출력·캐시 상태\n안전성 확인", C.slate700],
    ["02", "Read", "게시 문서 읽기\n변경 소스 계산", C.blue],
    ["03", "Begin TX", "staging·backup\n경로 생성", C.violet],
    ["04", "Prepare", "런타임 자산·\n해시 계획", C.cyan],
    ["05", "Graph", "경로·링크·\nmanifest 구성", C.blue],
    ["06", "Render", "Markdown → HTML\n증분 렌더링", C.emerald],
    ["07", "Emit", "페이지·자산·\n_headers 기록", C.cyan],
    ["08", "Commit", "staged swap +\ncache 저장", C.emerald],
  ];
  phases.forEach(([number, title, body, accent], index) => {
    const x = 0.62 + (index % 4) * 3.04;
    const y = 1.78 + Math.floor(index / 4) * 2.05;
    addStep(slide, {
      x,
      y,
      w: 2.73,
      index: number,
      title,
      body,
      accent,
    });
    if (index % 4 < 3) {
      addConnector(slide, {
        x: x + 2.73,
        y: y + 0.51,
        w: 0.31,
        color: C.slate300,
        width: 1.2,
      });
    }
  });
  addConnector(slide, {
    x: 12.49,
    y: 2.8,
    w: 0,
    h: 1.03,
    color: C.slate400,
    width: 1.2,
  });
  addConnector(slide, {
    x: 12.49,
    y: 3.83,
    w: -2.75,
    color: C.slate400,
    width: 1.2,
  });
  shape(slide, S.roundRect, 0.62, 5.91, 12.05, 0.63, {
    fill: { color: C.roseSoft },
    line: { color: C.rose, width: 0.9 },
  });
  text(slide, "EXCEPTION", 0.88, 6.09, 1.04, 0.22, {
    fontSize: 8.3,
    color: C.rose,
    bold: true,
  });
  text(
    slide,
    "어느 단계에서 실패해도 abort → staging 삭제 → 기존 output 보존 · 정리 자체가 실패하면 AggregateError로 원인 둘 다 보존",
    1.92,
    6.02,
    10.38,
    0.34,
    { fontSize: 8.8, color: C.slate700, bold: true },
  );
}

// 13 · 원자적 출력
{
  const slide = addSlide({
    title: "원자적 출력: 마지막 정상본을 손상시키지 않는다",
    subtitle: "staging build · rename swap · backup restore",
    section: "EIAM 실제 구조",
    notes:
      "핵심은 최종 output 디렉터리에 직접 덮어쓰지 않는 것이다. staging이 완성된 뒤 기존 output을 backup으로 이동하고 staging을 output으로 rename한다. 교체 실패 시 backup을 되돌린다.",
  });
  addLane(slide, {
    x: 0.62,
    y: 1.75,
    w: 12.05,
    h: 1.16,
    label: "시작",
    accent: C.slate700,
    fill: C.white,
  });
  addLane(slide, {
    x: 0.62,
    y: 3.1,
    w: 12.05,
    h: 1.16,
    label: "성공",
    accent: C.emerald,
    fill: C.emeraldSoft,
  });
  addLane(slide, {
    x: 0.62,
    y: 4.45,
    w: 12.05,
    h: 1.16,
    label: "실패",
    accent: C.rose,
    fill: C.roseSoft,
  });
  addNode(slide, {
    x: 1.98,
    y: 1.85,
    w: 1.95,
    icon: "DIST",
    label: "기존 output",
    meta: "last known good",
    accent: C.slate700,
  });
  addNode(slide, {
    x: 5.09,
    y: 1.85,
    w: 2.06,
    icon: "STG",
    label: "staging",
    meta: "complete build",
    accent: C.violet,
  });
  addNode(slide, {
    x: 8.5,
    y: 1.85,
    w: 2.05,
    icon: "IDX",
    label: "next cache",
    meta: "hash + source index",
    accent: C.cyan,
  });
  addConnector(slide, {
    x: 3.93,
    y: 2.38,
    w: 1.16,
    color: C.slate500,
    label: "copy/seed",
    labelY: 2.04,
    labelW: 0.94,
  });
  addConnector(slide, {
    x: 7.15,
    y: 2.38,
    w: 1.35,
    color: C.cyan,
    label: "prepare",
    labelY: 2.04,
    labelW: 0.8,
  });
  const success = [
    [1.98, "01", "output → backup", C.slate700],
    [4.95, "02", "staging → output", C.emerald],
    [8.0, "03", "cache commit", C.cyan],
    [10.55, "04", "backup 삭제", C.emerald],
  ];
  success.forEach(([x, num, label, accent], index) => {
    shape(slide, S.roundRect, x, 3.27, 1.82, 0.79, {
      fill: { color: C.white },
      line: { color: accent, width: 1 },
    });
    text(slide, num, x + 0.14, 3.46, 0.34, 0.22, {
      fontSize: 8,
      color: accent,
      bold: true,
    });
    text(slide, label, x + 0.49, 3.4, 1.18, 0.31, {
      fontSize: 8.3,
      color: C.ink,
      bold: true,
      align: "center",
    });
    if (index < success.length - 1) {
      addConnector(slide, {
        x: x + 1.82,
        y: 3.66,
        w: index === 1 ? 1.23 : index === 2 ? 0.73 : 1.15,
        color: C.emerald,
        width: 1.3,
      });
    }
  });
  shape(slide, S.roundRect, 1.98, 4.62, 3.02, 0.79, {
    fill: { color: C.white },
    line: { color: C.rose, width: 1 },
  });
  text(slide, "빌드 실패", 2.19, 4.82, 0.84, 0.25, {
    fontSize: 9.2,
    color: C.rose,
    bold: true,
  });
  text(slide, "staging 삭제", 3.1, 4.82, 1.64, 0.25, {
    fontSize: 8.8,
    color: C.slate700,
    bold: true,
    align: "right",
  });
  shape(slide, S.roundRect, 5.43, 4.62, 3.02, 0.79, {
    fill: { color: C.white },
    line: { color: C.rose, width: 1 },
  });
  text(slide, "교체 실패", 5.64, 4.82, 0.84, 0.25, {
    fontSize: 9.2,
    color: C.rose,
    bold: true,
  });
  text(slide, "backup → output", 6.52, 4.82, 1.66, 0.25, {
    fontSize: 8.8,
    color: C.slate700,
    bold: true,
    align: "right",
  });
  shape(slide, S.roundRect, 8.88, 4.62, 2.7, 0.79, {
    fill: { color: C.white },
    line: { color: C.emerald, width: 1 },
  });
  text(slide, "결과", 9.1, 4.82, 0.58, 0.25, {
    fontSize: 9.2,
    color: C.emerald,
    bold: true,
  });
  text(slide, "기존 정상본 유지", 9.74, 4.82, 1.57, 0.25, {
    fontSize: 8.8,
    color: C.slate700,
    bold: true,
    align: "right",
  });
  shape(slide, S.roundRect, 0.62, 6.0, 12.05, 0.57, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(
    slide,
    "Safety guard  filesystem root · cwd · vault · cache와 겹치는 출력 경로를 거부하고, EIAM ownership marker가 없는 비어 있지 않은 폴더는 덮어쓰지 않는다.",
    0.86,
    6.1,
    11.55,
    0.33,
    { fontSize: 8.3, color: C.white, bold: true, align: "center" },
  );
}

// 14 · 캐시와 Mermaid
{
  const slide = addSlide({
    title: "변경 가능성에 따라 캐시 정책을 분리한다",
    subtitle: "_headers · content-hashed runtime · self-hosted Mermaid",
    section: "EIAM 실제 구조",
    notes:
      "HTML, manifest, content fragment, SEO 파일과 안정된 이름의 정적 파일은 must-revalidate다. EIAM이 생성한 콘텐츠 해시 JS/CSS만 1년 immutable이다. Mermaid는 필요한 문서가 있을 때만 고정 버전을 self-host한다.",
  });
  shape(slide, S.roundRect, 0.62, 1.75, 5.84, 4.58, {
    fill: { color: C.white },
    line: { color: C.slate200, width: 0.8 },
    shadow,
  });
  shape(slide, S.roundRect, 6.82, 1.75, 5.85, 4.58, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  addPill(slide, "MUTABLE", 0.92, 2.05, 1.04, {
    fill: C.amberSoft,
    line: C.amberSoft,
    color: "92400E",
  });
  text(slide, "항상 재검증", 0.92, 2.52, 2.2, 0.36, {
    fontSize: 18,
    color: C.ink,
    bold: true,
  });
  text(slide, "public, max-age=0, must-revalidate", 0.92, 2.96, 4.8, 0.28, {
    fontSize: 9.2,
    color: C.slate500,
    fontFace: MONO,
  });
  const mutable = [
    "HTML routes",
    "manifest.json",
    "content fragments",
    "sitemap / robots / SEO",
    "copied stable-name files",
  ];
  mutable.forEach((item, index) => {
    shape(slide, S.ellipse, 0.96, 3.5 + index * 0.46, 0.18, 0.18, {
      fill: { color: C.amber },
      line: { color: C.amber, width: 0 },
    });
    text(slide, item, 1.3, 3.43 + index * 0.46, 4.57, 0.28, {
      fontSize: 9.2,
      color: C.slate700,
      bold: index === 0,
    });
  });
  addPill(slide, "IMMUTABLE", 7.14, 2.05, 1.2, {
    fill: C.slate800,
    line: C.slate800,
    color: C.cyan,
  });
  text(slide, "해시 자산만 1년", 7.14, 2.52, 3.0, 0.36, {
    fontSize: 18,
    color: C.white,
    bold: true,
  });
  text(slide, "public, max-age=31536000, immutable", 7.14, 2.96, 5.0, 0.28, {
    fontSize: 9.2,
    color: C.slate400,
    fontFace: MONO,
  });
  const immutable = [
    ["app.<hash>.css", C.blue],
    ["app.<hash>.js", C.blue],
    ["tree.<hash>.js", C.cyan],
    ["mermaid.<hash>.js", C.violet],
  ];
  immutable.forEach(([item, accent], index) => {
    shape(slide, S.roundRect, 7.14, 3.49 + index * 0.53, 4.92, 0.37, {
      fill: { color: C.slate800 },
      line: { color: C.slate700, width: 0.6 },
    });
    shape(slide, S.roundRect, 7.14, 3.49 + index * 0.53, 0.08, 0.37, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    text(slide, item, 7.42, 3.55 + index * 0.53, 3.1, 0.2, {
      fontSize: 8.5,
      color: C.white,
      fontFace: MONO,
      bold: true,
    });
    text(slide, "exact path override", 10.44, 3.55 + index * 0.53, 1.35, 0.2, {
      fontSize: 7.2,
      color: C.slate400,
      align: "right",
    });
  });
  text(slide, "Mermaid runtime", 7.14, 5.8, 1.38, 0.22, {
    fontSize: 8.5,
    color: C.cyan,
    bold: true,
  });
  text(slide, "문서에 다이어그램이 있을 때만 번들", 8.5, 5.77, 3.56, 0.27, {
    fontSize: 8.3,
    color: C.slate300,
    align: "right",
  });
}

// 15 · 프로덕션 검증
{
  const slide = addSlide({
    title: "검증 게이트를 통과한 바이트만 배포한다",
    subtitle: "scripts/validate-production.ts · machine-readable report",
    section: "EIAM 실제 구조",
    notes:
      "validator는 프로덕션 설정으로 사이트를 빌드하고 출력 스냅샷, 링크와 경로, 캐시 규칙, 재현성, Markdown 검사 등을 확인한다. JSON 보고서는 실패 시에도 업로드할 수 있다.",
  });
  addNode(slide, {
    x: 0.68,
    y: 3.08,
    w: 1.82,
    icon: "CFG",
    label: "Production input",
    meta: "vault + config",
    accent: C.blue,
  });
  addConnector(slide, {
    x: 2.5,
    y: 3.6,
    w: 0.66,
    color: C.blue,
    width: 2.2,
  });
  shape(slide, S.chevron, 3.12, 1.8, 5.08, 3.72, {
    fill: { color: C.navy },
    line: { color: C.navy, width: 0 },
  });
  text(slide, "PRODUCTION VALIDATION", 3.63, 2.04, 3.45, 0.28, {
    fontSize: 9.3,
    color: C.cyan,
    bold: true,
    charSpacing: 1.1,
    align: "center",
  });
  const checks = [
    ["01", "Build", "프로덕션 설정"],
    ["02", "Graph", "manifest · routes"],
    ["03", "Refs", "HTML/CSS 참조"],
    ["04", "Cache", "_headers 계약"],
    ["05", "Repeat", "동일 입력 재빌드"],
    ["06", "Markdown", "baseline/exclude"],
  ];
  checks.forEach(([num, title, meta], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 3.57 + col * 2.05;
    const y = 2.58 + row * 0.8;
    shape(slide, S.roundRect, x, y, 1.72, 0.58, {
      fill: { color: C.slate800 },
      line: { color: C.slate700, width: 0.7 },
    });
    text(slide, num, x + 0.12, y + 0.17, 0.27, 0.19, {
      fontSize: 7.3,
      color: C.cyan,
      bold: true,
    });
    text(slide, title, x + 0.43, y + 0.09, 1.07, 0.2, {
      fontSize: 8.3,
      color: C.white,
      bold: true,
    });
    text(slide, meta, x + 0.43, y + 0.31, 1.07, 0.16, {
      fontSize: 6.7,
      color: C.slate400,
    });
  });
  addConnector(slide, {
    x: 8.08,
    y: 3.6,
    w: 0.72,
    color: C.emerald,
    width: 2.2,
  });
  addNode(slide, {
    x: 8.8,
    y: 2.3,
    w: 1.95,
    icon: "SITE",
    label: "Validated site",
    meta: "exact directory",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 8.8,
    y: 4.05,
    w: 1.95,
    icon: "JSON",
    label: "Validation report",
    meta: "checks + failures",
    accent: C.cyan,
  });
  addConnector(slide, {
    x: 10.75,
    y: 2.82,
    w: 1.16,
    color: C.emerald,
    label: "PASS only",
    labelY: 2.49,
    labelW: 0.95,
  });
  shape(slide, S.roundRect, 11.91, 2.3, 0.76, 1.05, {
    fill: { color: C.emeraldSoft },
    line: { color: C.emerald, width: 1 },
  });
  text(slide, "DEPLOY", 11.98, 2.56, 0.61, 0.2, {
    fontSize: 7.8,
    color: "047857",
    bold: true,
    align: "center",
  });
  text(slide, "ABLE", 11.98, 2.8, 0.61, 0.2, {
    fontSize: 7.8,
    color: "047857",
    bold: true,
    align: "center",
  });
  shape(slide, S.roundRect, 11.0, 4.05, 1.67, 1.05, {
    fill: { color: C.roseSoft },
    line: { color: C.rose, width: 1 },
  });
  text(slide, "FAIL", 11.18, 4.26, 1.31, 0.22, {
    fontSize: 10.2,
    color: C.rose,
    bold: true,
    align: "center",
  });
  text(slide, "배포 차단 + 보고서 보존", 11.16, 4.56, 1.35, 0.34, {
    fontSize: 7.2,
    color: C.slate600,
    bold: true,
    align: "center",
  });
  addConnector(slide, {
    x: 10.75,
    y: 4.57,
    w: 0.25,
    color: C.rose,
    dash: "dash",
  });
  shape(slide, S.roundRect, 0.68, 5.92, 11.99, 0.59, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.7 },
  });
  text(
    slide,
    "보고서 계약  schemaVersion · generatedAt · status · configuration · checks · failures · metrics",
    0.94,
    6.05,
    11.49,
    0.28,
    { fontSize: 8.6, color: C.slate600, fontFace: MONO, align: "center" },
  );
}

// 16 · 릴리스
{
  const slide = addSlide({
    title: "패키지 릴리스는 하나의 품질 경로만 가진다",
    subtitle: "Exact tag → quality → verified tarball → npm + GitHub Release",
    section: "EIAM 실제 구조",
    notes:
      "release.yml만 v* 태그를 발행한다. quality job에서 정확한 태그를 체크아웃하고 검증한 뒤 tarball을 만든다. publish job은 전달된 동일 바이트의 SRI/SHA-256을 확인하고 자격 증명을 사용한다.",
  });
  addLane(slide, {
    x: 0.62,
    y: 1.72,
    w: 12.05,
    h: 2.05,
    label: "QUALITY",
    accent: C.blue,
    fill: C.blueSoft,
  });
  addLane(slide, {
    x: 0.62,
    y: 4.03,
    w: 12.05,
    h: 2.05,
    label: "PUBLISH",
    accent: C.violet,
    fill: C.violetSoft,
  });
  const quality = [
    ["TAG", "Exact tag", "vX.Y.Z = package", C.blue],
    ["QA", "Full quality", "lint · test · E2E", C.emerald],
    ["PACK", "bun pm pack", "one npm tarball", C.cyan],
    ["HASH", "Record identity", "SRI + SHA-256", C.violet],
    ["ART", "Transfer", "verified artifact", C.blue],
  ];
  quality.forEach(([icon, title, meta, accent], index) => {
    const x = 1.9 + index * 2.08;
    addNode(slide, {
      x,
      y: 2.18,
      w: 1.72,
      h: 1.03,
      icon,
      label: title,
      meta,
      accent,
    });
    if (index < quality.length - 1) {
      addConnector(slide, {
        x: x + 1.72,
        y: 2.7,
        w: 0.36,
        color: C.slate400,
        width: 1.2,
      });
    }
  });
  const publish = [
    ["GET", "Download", "same artifact", C.violet],
    ["VERIFY", "Verify bytes", "identity + integrity", C.emerald],
    ["NPM", "Publish/reconcile", "exact package", C.violet],
    ["GH", "GitHub Release", "same tag", C.blue],
  ];
  publish.forEach(([icon, title, meta, accent], index) => {
    const x = 2.24 + index * 2.55;
    addNode(slide, {
      x,
      y: 4.49,
      w: 2.04,
      h: 1.03,
      icon,
      label: title,
      meta,
      accent,
    });
    if (index < publish.length - 1) {
      addConnector(slide, {
        x: x + 2.04,
        y: 5.01,
        w: 0.51,
        color: C.violet,
        width: 1.3,
      });
    }
  });
  addConnector(slide, {
    x: 11.93,
    y: 3.21,
    w: 0,
    h: 1.28,
    color: C.violet,
    width: 2.2,
    label: "artifact hand-off",
    labelX: 10.83,
    labelY: 3.63,
    labelW: 1.35,
  });
  addPill(slide, "NO PUBLISH CREDENTIAL", 0.92, 3.23, 1.93, {
    fill: C.emeraldSoft,
    line: C.emeraldSoft,
    color: "047857",
  });
  addPill(slide, "NPM_TOKEN ONLY HERE", 0.92, 5.62, 1.93, {
    fill: C.violetSoft,
    line: C.violetSoft,
    color: C.violet,
  });
}

// 17 · Cloudflare 배포
{
  const slide = addSlide({
    title: "Cloudflare 배포는 비밀 없는 검증 job과 분리한다",
    subtitle: "Reusable workflow · artifact-only · preview · production",
    section: "EIAM 실제 구조",
    notes:
      "build-validate job이 검증된 사이트와 보고서를 업로드한다. artifact-only에서는 여기서 종료한다. deploy job은 정확한 아티팩트를 내려받아 프로젝트 환경을 확인하고 고정 Wrangler로 Direct Upload한다.",
  });
  shape(slide, S.roundRect, 0.62, 1.73, 5.74, 4.62, {
    fill: { color: C.white },
    line: { color: C.blue, width: 1.2 },
    shadow,
  });
  shape(slide, S.roundRect, 6.69, 1.73, 5.98, 4.62, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  addPill(slide, "JOB 1 · BUILD-VALIDATE", 0.9, 1.98, 1.88, {
    fill: C.blueSoft,
    line: C.blueSoft,
    color: C.blueDark,
  });
  addPill(slide, "JOB 2 · DEPLOY", 6.99, 1.98, 1.43, {
    fill: C.slate800,
    line: C.slate800,
    color: C.cyan,
  });
  const leftSteps = [
    ["01", "입력/브랜치 검증", "path overlap · fork guard"],
    ["02", "Frozen install", "caller-pinned Bun + lock"],
    ["03", "Build + production validation", "NO CLOUDFLARE SECRETS"],
    ["04", "Artifact upload", "site 7d · report 14d"],
  ];
  leftSteps.forEach(([num, title, body], index) => {
    addStep(slide, {
      x: 0.92,
      y: 2.54 + index * 0.79,
      w: 5.15,
      index: num,
      title,
      body,
      accent: index === 2 ? C.emerald : C.blue,
    });
  });
  const rightSteps = [
    ["01", "Exact artifact download", "Job 1 output only"],
    ["02", "Project/environment guard", "production branch match"],
    ["03", "Wrangler Direct Upload", "exact version + credentials"],
    ["04", "Deployment identity", "URL · alias · ID · SHA"],
  ];
  rightSteps.forEach(([num, title, body], index) => {
    addStep(slide, {
      x: 7.01,
      y: 2.54 + index * 0.79,
      w: 5.34,
      index: num,
      title,
      body,
      accent: index === 2 ? C.cyan : C.violet,
    });
  });
  addConnector(slide, {
    x: 6.36,
    y: 4.2,
    w: 0.33,
    color: C.cyan,
    width: 3,
    label: "exact artifact",
    labelX: 5.9,
    labelY: 3.84,
    labelW: 1.26,
  });
  const modes = [
    ["PR / fork", "artifact-only", "배포 없음", C.slate700],
    ["preview", "preview branch", "alias 갱신", C.cyan],
    ["production", "main only", "승인 + 직렬화", C.emerald],
  ];
  modes.forEach(([trigger, mode, result, accent], index) => {
    const x = 0.92 + index * 3.72;
    shape(slide, S.roundRect, x, 5.92, 3.43, 0.48, {
      fill: { color: index === 2 ? C.emeraldSoft : C.slate100 },
      line: { color: accent, width: 0.8 },
    });
    text(slide, trigger, x + 0.14, 6.04, 0.86, 0.2, {
      fontSize: 7.8,
      color: accent,
      bold: true,
    });
    text(slide, mode, x + 1.02, 6.04, 1.12, 0.2, {
      fontSize: 7.6,
      color: C.slate700,
      fontFace: MONO,
      bold: true,
      align: "center",
    });
    text(slide, result, x + 2.15, 6.04, 1.03, 0.2, {
      fontSize: 7.6,
      color: C.slate600,
      align: "right",
    });
  });
}

// 18 · 실패와 롤백
{
  const slide = addSlide({
    title: "실패 지점마다 보존해야 할 정상 상태가 다르다",
    subtitle: "Failure isolation · retry boundary · manual rollback",
    section: "EIAM 실제 구조",
    notes:
      "빌드 실패는 로컬/CI의 기존 output을 보존한다. 검증 실패는 site artifact와 deploy job을 차단한다. 배포 실패는 기존 Cloudflare 배포를 유지한다. 운영 회귀는 이전 성공 production deployment로 수동 롤백한다.",
  });
  addDecisionTable(slide, {
    x: 0.62,
    y: 1.76,
    widths: [2.02, 2.36, 2.45, 2.42, 2.8],
    rows: [
      ["실패 지점", "차단 범위", "보존되는 정상 상태", "증거", "복구"],
      [
        "빌드 단계",
        "staging transaction",
        "기존 output + cache",
        "예외 + 파일 상태",
        "원인 수정 후 재빌드",
      ],
      ["프로덕션 검증", "site artifact", "이전 배포", "JSON report", "검증 실패 항목 수정"],
      ["배포 job", "신규 deployment", "현재 Pages 배포", "job log + deploy ID", "안전한 재실행"],
      ["운영 회귀", "사용자 트래픽", "이전 production 배포", "URL · ID · commit", "Pages rollback"],
    ],
  });
  shape(slide, S.roundRect, 0.62, 4.78, 12.05, 1.52, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(slide, "ROLLBACK RUNBOOK", 0.92, 5.02, 1.66, 0.25, {
    fontSize: 9.2,
    color: C.cyan,
    bold: true,
    charSpacing: 0.9,
  });
  const rollback = [
    ["1", "대상 확인", "production · success"],
    ["2", "ID 검증", "URL · time · commit"],
    ["3", "승인 실행", "dashboard / API"],
    ["4", "재검증", "route · _headers"],
  ];
  rollback.forEach(([num, title, body], index) => {
    const x = 0.92 + index * 2.88;
    shape(slide, S.roundRect, x, 5.43, 2.56, 0.56, {
      fill: { color: C.slate800 },
      line: { color: C.slate700, width: 0.7 },
    });
    shape(slide, S.ellipse, x + 0.12, 5.56, 0.3, 0.3, {
      fill: { color: index === 2 ? C.rose : C.cyan },
      line: { color: index === 2 ? C.rose : C.cyan, width: 0 },
    });
    text(slide, num, x + 0.12, 5.57, 0.3, 0.27, {
      fontSize: 7.5,
      color: C.white,
      bold: true,
      align: "center",
    });
    text(slide, title, x + 0.53, 5.48, 0.82, 0.22, {
      fontSize: 8.1,
      color: C.white,
      bold: true,
    });
    text(slide, body, x + 1.25, 5.5, 1.1, 0.2, {
      fontSize: 6.9,
      color: C.slate400,
      align: "right",
    });
  });
  shape(slide, S.roundRect, 8.65, 6.48, 4.02, 0.31, {
    fill: { color: C.roseSoft },
    line: { color: C.roseSoft, width: 0 },
  });
  text(slide, "Preview deployment는 production rollback 대상이 아니다.", 8.82, 6.54, 3.68, 0.17, {
    fontSize: 7.4,
    color: C.rose,
    bold: true,
    align: "center",
  });
}

// 19 · 이슈 44 작업 지도
{
  const slide = addSlide({
    title: "이슈 #44는 8개의 독립된 신뢰성 축으로 완성됐다",
    subtitle: "PR #90–#97 → mother PR #98 → main",
    section: "EIAM 실제 구조",
    notes:
      "각 작업은 도구 고정, atomic output, Mermaid self-hosting, cache headers, release artifact 정리, release workflow 통합, production validator, Cloudflare deployment 순서로 병합됐다.",
  });
  const work = [
    ["01", "#90", "Toolchain", "Bun 고정", C.slate700],
    ["02", "#91", "Atomic output", "staged swap", C.blue],
    ["03", "#92", "Mermaid", "self-hosted", C.violet],
    ["04", "#93", "Cache", "_headers", C.cyan],
    ["05", "#94", "Artifact", "site archive 제거", C.amber],
    ["06", "#95", "Release", "단일 tag 경로", C.violet],
    ["07", "#96", "Validation", "production gate", C.emerald],
    ["08", "#97", "Deploy", "Cloudflare reusable", C.cyan],
  ];
  work.forEach(([num, pr, title, body, accent], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 0.62 + col * 3.04;
    const y = 1.76 + row * 1.73;
    shape(slide, S.roundRect, x, y, 2.73, 1.35, {
      fill: { color: C.white },
      line: { color: C.slate200, width: 0.8 },
      shadow,
    });
    shape(slide, S.ellipse, x + 0.2, y + 0.22, 0.48, 0.48, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    text(slide, num, x + 0.2, y + 0.23, 0.48, 0.44, {
      fontSize: 8,
      color: C.white,
      bold: true,
      align: "center",
    });
    addPill(slide, pr, x + 1.92, y + 0.22, 0.58, {
      h: 0.25,
      fontSize: 7.1,
      fill: C.slate100,
      line: C.slate100,
      color: C.slate600,
    });
    text(slide, title, x + 0.84, y + 0.23, 1.02, 0.3, {
      fontSize: 9.3,
      color: C.ink,
      bold: true,
    });
    text(slide, body, x + 0.84, y + 0.61, 1.68, 0.25, {
      fontSize: 7.8,
      color: C.slate500,
    });
    shape(slide, S.roundRect, x + 0.2, y + 1.02, 2.3, 0.12, {
      fill: { color: accent, transparency: 34 },
      line: { color: accent, transparency: 100, width: 0 },
    });
  });
  shape(slide, S.roundRect, 0.62, 5.52, 12.05, 0.84, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(slide, "MERGE", 0.94, 5.75, 0.68, 0.22, {
    fontSize: 8.5,
    color: C.cyan,
    bold: true,
  });
  text(slide, "8 sub PRs", 1.7, 5.7, 1.16, 0.29, {
    fontSize: 11,
    color: C.white,
    bold: true,
  });
  addConnector(slide, {
    x: 2.88,
    y: 5.88,
    w: 1.28,
    color: C.slate500,
    width: 1.3,
  });
  text(slide, "issue-44-mother", 4.25, 5.7, 1.92, 0.29, {
    fontSize: 11,
    color: C.white,
    bold: true,
    align: "center",
  });
  addConnector(slide, {
    x: 6.22,
    y: 5.88,
    w: 1.28,
    color: C.slate500,
    width: 1.3,
  });
  text(slide, "PR #98", 7.58, 5.7, 1.14, 0.29, {
    fontSize: 11,
    color: C.white,
    bold: true,
    align: "center",
  });
  addConnector(slide, {
    x: 8.82,
    y: 5.88,
    w: 1.28,
    color: C.emerald,
    width: 1.8,
  });
  addPill(slide, "MAIN · MERGED", 10.24, 5.71, 1.86, {
    fill: C.emerald,
    line: C.emerald,
    color: C.white,
  });
}

// 20 · 소스 구조
{
  const slide = addSlide({
    title: "소스 구조는 생성 시점과 브라우저 실행 시점을 분리한다",
    subtitle: "Build-time TypeScript · Browser runtime JavaScript · Delivery workflows",
    section: "EIAM 실제 구조",
    notes:
      "src/build는 빌드 파이프라인과 저장소 트랜잭션을 소유한다. src/runtime은 생성된 사이트에서 실행되는 브라우저 컨트롤러다. scripts는 프로덕션 검증과 품질 도구, workflows는 릴리스와 배포 전달을 소유한다.",
  });
  const columns = [
    {
      x: 0.62,
      w: 3.0,
      title: "src/build/",
      accent: C.blue,
      files: [
        ["pipeline.ts", "오케스트레이션"],
        ["storage.ts", "atomic transaction"],
        ["source.ts", "입력·cache"],
        ["graph.ts", "문서 그래프"],
        ["content.ts", "렌더링"],
        ["output.ts", "자산·페이지 출력"],
        ["cache-headers.ts", "호스트 정책"],
      ],
    },
    {
      x: 3.86,
      w: 3.0,
      title: "src/runtime/",
      accent: C.violet,
      files: [
        ["runtime-bootstrap.js", "초기화"],
        ["app.js", "조합 root"],
        ["navigation-state.js", "URL 상태"],
        ["*-controller.js", "행동 단위"],
        ["manifest-adapter.js", "데이터 경계"],
        ["tree-runtime.js", "트리 로딩"],
        ["app.css", "reader UI"],
      ],
    },
    {
      x: 7.1,
      w: 2.58,
      title: "scripts/",
      accent: C.emerald,
      files: [
        ["validate-production.ts", "검증 CLI"],
        ["production-validation.ts", "검증 코어"],
        ["check-output-size.ts", "크기 budget"],
        ["check-build-…", "재현성"],
        ["lint-published-…", "Markdown"],
      ],
    },
    {
      x: 9.92,
      w: 2.75,
      title: ".github/workflows/",
      accent: C.cyan,
      files: [
        ["ci.yml", "일반 품질"],
        ["release.yml", "npm 릴리스"],
        ["deploy-cloudflare-…", "사이트 배포"],
      ],
    },
  ];
  columns.forEach((column) => {
    shape(slide, S.roundRect, column.x, 1.75, column.w, 4.74, {
      fill: { color: C.white },
      line: { color: C.slate200, width: 0.8 },
      shadow,
    });
    shape(slide, S.roundRect, column.x, 1.75, column.w, 0.6, {
      fill: { color: column.accent },
      line: { color: column.accent, width: 0 },
    });
    text(slide, column.title, column.x + 0.18, 1.9, column.w - 0.36, 0.24, {
      fontSize: 10.2,
      color: C.white,
      bold: true,
      fontFace: MONO,
      align: "center",
    });
    column.files.forEach(([file, role], index) => {
      const y = 2.6 + index * 0.51;
      shape(slide, S.roundRect, column.x + 0.16, y, column.w - 0.32, 0.36, {
        fill: { color: index % 2 === 0 ? C.slate100 : C.white },
        line: { color: C.slate200, width: 0.5 },
      });
      text(slide, file, column.x + 0.27, y + 0.06, column.w * 0.56, 0.2, {
        fontSize: 7.1,
        color: column.accent,
        bold: true,
        fontFace: MONO,
      });
      text(slide, role, column.x + column.w * 0.58, y + 0.06, column.w * 0.33, 0.2, {
        fontSize: 6.9,
        color: C.slate500,
        align: "right",
      });
    });
  });
  addPill(slide, "BUILD TIME", 0.8, 6.63, 1.05, {
    fill: C.blueSoft,
    line: C.blueSoft,
    color: C.blueDark,
  });
  addPill(slide, "BROWSER", 4.04, 6.63, 0.94, {
    fill: C.violetSoft,
    line: C.violetSoft,
    color: C.violet,
  });
  addPill(slide, "QUALITY", 7.28, 6.63, 0.94, {
    fill: C.emeraldSoft,
    line: C.emeraldSoft,
    color: "047857",
  });
  addPill(slide, "DELIVERY", 10.1, 6.63, 0.96, {
    fill: C.cyanSoft,
    line: C.cyanSoft,
    color: "0E7490",
  });
}

// 21 · 모듈 의존성
{
  const slide = addSlide({
    title: "모듈 의존성은 pipeline을 중심으로 단방향이다",
    subtitle: "Entry → orchestration → phases → transaction / output contracts",
    section: "EIAM 실제 구조",
    notes:
      "CLI는 buildSite를 호출한다. pipeline은 source, graph, content, output, storage를 조정한다. runtime 코드는 빌드 결과물로 전달되지만 빌드 오케스트레이션을 역참조하지 않는다.",
  });
  addNode(slide, {
    x: 0.68,
    y: 3.0,
    w: 1.64,
    icon: "CLI",
    label: "src/cli.ts",
    meta: "command entry",
    accent: C.slate700,
  });
  addNode(slide, {
    x: 3.02,
    y: 2.86,
    w: 2.14,
    h: 1.28,
    icon: "PIPE",
    label: "build/pipeline.ts",
    meta: "buildSite orchestration",
    accent: C.blue,
  });
  addConnector(slide, {
    x: 2.32,
    y: 3.52,
    w: 0.7,
    color: C.blue,
    width: 2,
    label: "build",
    labelY: 3.2,
    labelW: 0.62,
  });
  const phaseNodes = [
    { x: 6.0, y: 1.74, icon: "SRC", label: "source.ts", meta: "read + cache", accent: C.blue },
    { x: 8.26, y: 1.74, icon: "GRF", label: "graph.ts", meta: "routes + links", accent: C.cyan },
    {
      x: 10.52,
      y: 1.74,
      icon: "HTML",
      label: "content.ts",
      meta: "render docs",
      accent: C.emerald,
    },
    { x: 6.0, y: 4.62, icon: "OUT", label: "output.ts", meta: "emit files", accent: C.cyan },
    { x: 8.26, y: 4.62, icon: "TX", label: "storage.ts", meta: "atomic swap", accent: C.violet },
    {
      x: 10.52,
      y: 4.62,
      icon: "CTR",
      label: "contracts.ts",
      meta: "shared types",
      accent: C.slate700,
    },
  ];
  phaseNodes.forEach((node) => addNode(slide, { ...node, w: 1.78, h: 0.96 }));
  phaseNodes.forEach((node, index) => {
    const startY = index < 3 ? 3.15 : 3.82;
    const targetY = index < 3 ? 2.22 : 5.1;
    addConnector(slide, {
      x: 5.16,
      y: startY,
      w: node.x - 5.16,
      h: targetY - startY,
      color: index === 4 ? C.violet : C.slate400,
      width: index === 4 ? 1.8 : 1.1,
    });
  });
  shape(slide, S.roundRect, 5.74, 2.97, 6.78, 1.06, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.8 },
  });
  text(slide, "OUTPUT CONTRACT", 6.0, 3.15, 1.5, 0.23, {
    fontSize: 8.4,
    color: C.slate600,
    bold: true,
    charSpacing: 0.8,
  });
  text(
    slide,
    "static HTML · manifest · content · hashed runtime · _headers · ownership marker",
    6.0,
    3.48,
    6.24,
    0.25,
    {
      fontSize: 8.6,
      color: C.ink,
      fontFace: MONO,
      bold: true,
      align: "center",
    },
  );
  shape(slide, S.roundRect, 0.68, 5.58, 4.48, 0.76, {
    fill: { color: C.violetSoft },
    line: { color: C.violet, width: 0.8 },
  });
  text(slide, "runtime/*", 0.94, 5.76, 1.0, 0.25, {
    fontSize: 9.5,
    color: C.violet,
    bold: true,
    fontFace: MONO,
  });
  text(slide, "output에 포함되지만 pipeline을 역참조하지 않음", 1.91, 5.72, 2.94, 0.32, {
    fontSize: 8.2,
    color: C.slate700,
    bold: true,
    align: "right",
  });
}

// 22 · 선택형 WAS 섹션
addSectionSlide({
  eyebrow: "OPTIONAL · REFERENCE",
  title: "WAS·서버 통신 참조 아키텍처",
  body: "다음 슬라이드는 EIAM의 현재 필수 구조가 아니다. 별도 API, 업무 트랜잭션, 실시간 데이터가 필요한 시스템을 설명할 때 복사해 쓰는 선택형 예제다.",
  section: "WAS 선택형 예시",
  index: 2,
  accent: C.amber,
});

// 23 · 3-tier WAS
{
  const slide = addSlide({
    title: "참조 구조: 다계층 WAS 아키텍처",
    subtitle: "선택형 예시 · Edge → Application → Data",
    section: "WAS 선택형 예시",
    notes:
      "이 슬라이드는 API와 업무 데이터가 필요한 일반적인 서비스 예시다. EIAM에 그대로 필요한 구조가 아니다. 각 영역 이름, 노드 기술, 프로토콜을 조직 환경에 맞게 바꾼다.",
  });
  const zones = [
    { x: 0.62, w: 2.33, label: "CHANNEL / EDGE", accent: C.cyan, fill: C.cyanSoft },
    { x: 3.2, w: 5.95, label: "APPLICATION", accent: C.blue, fill: C.blueSoft },
    { x: 9.4, w: 3.27, label: "DATA / INTEGRATION", accent: C.violet, fill: C.violetSoft },
  ];
  zones.forEach((zone) => {
    shape(slide, S.roundRect, zone.x, 1.72, zone.w, 4.75, {
      fill: { color: zone.fill, transparency: 62 },
      line: { color: zone.accent, width: 1, dash: "dash" },
    });
    text(slide, zone.label, zone.x + 0.17, 1.9, zone.w - 0.34, 0.22, {
      fontSize: 8.3,
      color: zone.accent,
      bold: true,
      charSpacing: 0.7,
      align: "center",
    });
  });
  addNode(slide, {
    x: 0.87,
    y: 2.42,
    w: 1.82,
    icon: "WEB",
    label: "Web / Mobile",
    meta: "HTTPS · JSON",
    accent: C.blue,
  });
  addNode(slide, {
    x: 0.87,
    y: 4.24,
    w: 1.82,
    icon: "WAF",
    label: "CDN + WAF",
    meta: "TLS · rate limit",
    accent: C.cyan,
  });
  addNode(slide, {
    x: 3.48,
    y: 2.36,
    w: 1.85,
    icon: "GW",
    label: "API Gateway",
    meta: "auth · routing",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 5.86,
    y: 2.02,
    w: 2.05,
    icon: "WAS",
    label: "WAS Pool A",
    meta: "stateless · autoscale",
    accent: C.blue,
  });
  addNode(slide, {
    x: 5.86,
    y: 3.33,
    w: 2.05,
    icon: "WAS",
    label: "WAS Pool B",
    meta: "stateless · autoscale",
    accent: C.blue,
  });
  addNode(slide, {
    x: 5.86,
    y: 4.64,
    w: 2.05,
    icon: "JOB",
    label: "Worker Pool",
    meta: "async consumer",
    accent: C.violet,
  });
  addNode(slide, {
    x: 9.72,
    y: 2.02,
    w: 2.14,
    icon: "DB",
    label: "Primary DB",
    meta: "transaction data",
    accent: C.cyan,
  });
  addNode(slide, {
    x: 9.72,
    y: 3.33,
    w: 2.14,
    icon: "RDS",
    label: "Read / Cache",
    meta: "replica · Redis",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 9.72,
    y: 4.64,
    w: 2.14,
    icon: "MQ",
    label: "Event Broker",
    meta: "topic · DLQ",
    accent: C.violet,
  });
  addConnector(slide, {
    x: 1.78,
    y: 3.47,
    w: 0,
    h: 0.77,
    color: C.cyan,
    label: "HTTPS",
    labelX: 1.16,
    labelY: 3.72,
    labelW: 0.7,
  });
  addConnector(slide, {
    x: 2.69,
    y: 4.76,
    w: 0.79,
    h: -1.88,
    color: C.cyan,
    label: "TLS",
    labelX: 2.75,
    labelY: 3.46,
    labelW: 0.58,
  });
  addConnector(slide, {
    x: 5.33,
    y: 2.88,
    w: 0.53,
    color: C.blue,
    label: "REST/gRPC",
    labelY: 2.54,
    labelW: 0.92,
  });
  addConnector(slide, {
    x: 5.33,
    y: 2.98,
    w: 0.53,
    h: 0.86,
    color: C.blue,
  });
  addConnector(slide, {
    x: 7.91,
    y: 2.55,
    w: 1.81,
    color: C.cyan,
    label: "SQL",
    labelY: 2.22,
    labelW: 0.55,
  });
  addConnector(slide, {
    x: 7.91,
    y: 3.86,
    w: 1.81,
    color: C.emerald,
    label: "read/cache",
    labelY: 3.52,
    labelW: 0.9,
  });
  addConnector(slide, {
    x: 7.91,
    y: 5.17,
    w: 1.81,
    color: C.violet,
    dash: "dash",
    label: "events",
    labelY: 4.84,
    labelW: 0.7,
  });
  shape(slide, S.roundRect, 3.47, 5.77, 4.43, 0.42, {
    fill: { color: C.white },
    line: { color: C.slate200, width: 0.7 },
  });
  text(
    slide,
    "원칙  WAS는 stateless · 세션/상태는 외부 저장소 · 쓰기는 트랜잭션 경계 안에서",
    3.68,
    5.87,
    4.02,
    0.22,
    { fontSize: 7.8, color: C.slate600, bold: true, align: "center" },
  );
}

// 24 · 동기 서버 통신
{
  const slide = addSlide({
    title: "동기 서버 통신은 지연 예산과 실패 경계를 함께 그린다",
    subtitle: "선택형 예시 · REST/gRPC · timeout · retry · circuit breaker",
    section: "WAS 선택형 예시",
    notes:
      "동기 호출은 단순하지만 지연과 장애가 호출 체인을 따라 전파된다. 선 라벨에는 프로토콜뿐 아니라 timeout, 재시도 허용 여부, 멱등 키를 함께 적는다.",
  });
  const services = [
    { x: 0.68, w: 1.65, icon: "WEB", label: "Client", meta: "request-id", accent: C.blue },
    { x: 2.7, w: 1.75, icon: "GW", label: "Gateway", meta: "auth + limit", accent: C.emerald },
    { x: 4.82, w: 1.75, icon: "ORD", label: "Order", meta: "WAS · orchestrator", accent: C.blue },
    { x: 6.94, w: 1.75, icon: "INV", label: "Inventory", meta: "gRPC", accent: C.cyan },
    { x: 9.06, w: 1.75, icon: "PAY", label: "Payment", meta: "REST", accent: C.violet },
    { x: 11.18, w: 1.45, icon: "EXT", label: "PG", meta: "external", accent: C.rose },
  ];
  services.forEach((service) =>
    addNode(slide, {
      x: service.x,
      y: 2.45,
      w: service.w,
      h: 1.03,
      ...service,
    }),
  );
  const calls = [
    [2.33, 0.37, "1 · HTTPS 2s", C.blue],
    [4.45, 0.37, "2 · internal 1.5s", C.blue],
    [6.57, 0.37, "3 · gRPC 300ms", C.cyan],
    [8.69, 0.37, "4 · REST 800ms", C.violet],
    [10.81, 0.37, "5 · TLS 600ms", C.rose],
  ];
  calls.forEach(([x, w, label, color]) => {
    addConnector(slide, {
      x,
      y: 2.97,
      w,
      color,
      width: 1.7,
      label,
      labelY: 2.18,
      labelW: 1.16,
    });
  });
  shape(slide, S.roundRect, 0.68, 3.9, 11.99, 0.68, {
    fill: { color: C.roseSoft },
    line: { color: C.rose, width: 0.8 },
  });
  text(slide, "지연 예산", 0.92, 4.1, 0.85, 0.22, {
    fontSize: 8.5,
    color: C.rose,
    bold: true,
  });
  text(
    slide,
    "외부 응답 600 ms + 결제 200 ms + 재고 150 ms + 애플리케이션 250 ms + 네트워크/여유 300 ms = 1.5 s",
    1.8,
    4.03,
    10.45,
    0.33,
    { fontSize: 8.8, color: C.slate700, bold: true, align: "center" },
  );
  const rules = [
    ["TIMEOUT", "상위 timeout > 하위 합계\n무한 대기 금지", C.blue],
    ["RETRY", "GET·멱등 요청만\njitter + 최대 횟수", C.amber],
    ["CIRCUIT", "연속 실패 시 차단\nfallback 명시", C.rose],
    ["IDENTITY", "mTLS/service token\n최소 권한", C.emerald],
    ["TRACE", "trace-id 전 구간 전파\n민감값 제외", C.violet],
  ];
  rules.forEach(([title, body, accent], index) => {
    addCard(slide, {
      x: 0.68 + index * 2.42,
      y: 4.96,
      w: 2.16,
      h: 1.23,
      title,
      body,
      accent,
      icon: String(index + 1).padStart(2, "0"),
    });
  });
}

// 25 · 시퀀스
{
  const slide = addSlide({
    title: "시퀀스 다이어그램: 성공과 실패를 같은 시간축에 둔다",
    subtitle: "선택형 예시 · 주문 생성 · 보상 가능한 결제",
    section: "WAS 선택형 예시",
    notes:
      "시퀀스는 한 요청의 시간 순서를 보여준다. 아래 예시는 DB 트랜잭션 안에서 주문과 outbox를 함께 기록하고, 결제 실패 시 주문 상태를 FAILED로 바꾸는 단순화된 흐름이다.",
  });
  const actors = [
    ["Client", 0.82, C.blue],
    ["Gateway", 2.56, C.emerald],
    ["Order WAS", 4.46, C.blue],
    ["Inventory", 6.48, C.cyan],
    ["Payment", 8.44, C.violet],
    ["DB / Outbox", 10.56, C.slate700],
  ];
  actors.forEach(([name, x, accent]) => {
    shape(slide, S.roundRect, x, 1.7, 1.34, 0.48, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    text(slide, name, x + 0.08, 1.82, 1.18, 0.22, {
      fontSize: 8,
      color: C.white,
      bold: true,
      align: "center",
    });
    slide.addShape(S.line, {
      x: x + 0.67,
      y: 2.18,
      w: 0,
      h: 4.12,
      line: { color: C.slate300, width: 1, dash: "dash" },
    });
  });
  const messages = [
    { from: 1.49, to: 3.23, y: 2.48, label: "1  POST /orders · Idempotency-Key", color: C.blue },
    { from: 3.23, to: 5.13, y: 2.88, label: "2  auth context + request-id", color: C.emerald },
    { from: 5.13, to: 7.15, y: 3.28, label: "3  reserve(items) · 300 ms", color: C.cyan },
    { from: 7.15, to: 5.13, y: 3.68, label: "4  reservationId", color: C.cyan, reverse: true },
    { from: 5.13, to: 9.11, y: 4.08, label: "5  authorize(amount) · 800 ms", color: C.violet },
    {
      from: 9.11,
      to: 5.13,
      y: 4.48,
      label: "6  approved / declined",
      color: C.violet,
      reverse: true,
    },
    { from: 5.13, to: 11.23, y: 5.33, label: "7  TX: order + outbox", color: C.slate700 },
    {
      from: 5.13,
      to: 1.49,
      y: 5.82,
      label: "8  201 Created · orderId",
      color: C.emerald,
      reverse: true,
    },
  ];
  messages.forEach((message) => {
    const left = Math.min(message.from, message.to);
    const width = Math.abs(message.to - message.from);
    slide.addShape(S.line, {
      x: left,
      y: message.y,
      w: width,
      h: 0,
      line: {
        color: message.color,
        width: 1.25,
        beginArrowType: message.reverse ? "triangle" : "none",
        endArrowType: message.reverse ? "none" : "triangle",
      },
    });
    shape(slide, S.roundRect, left + width / 2 - 1.28, message.y - 0.23, 2.56, 0.23, {
      fill: { color: C.paper },
      line: { color: C.paper, transparency: 100, width: 0 },
    });
    text(slide, message.label, left + width / 2 - 1.28, message.y - 0.22, 2.56, 0.19, {
      fontSize: 6.7,
      color: message.color,
      bold: true,
      align: "center",
    });
  });
  shape(slide, S.roundRect, 4.18, 4.57, 5.43, 0.46, {
    fill: { color: C.roseSoft, transparency: 14 },
    line: { color: C.rose, width: 0.8, dash: "dash" },
  });
  text(slide, "ALT · 결제 거절", 4.38, 4.67, 1.15, 0.2, {
    fontSize: 7.5,
    color: C.rose,
    bold: true,
  });
  text(slide, "reservation release + FAILED 상태 · 재시도 대신 사용자 확인", 5.54, 4.62, 3.8, 0.3, {
    fontSize: 7.2,
    color: C.slate700,
    bold: true,
    align: "right",
  });
  shape(slide, S.roundRect, 0.82, 6.42, 11.08, 0.3, {
    fill: { color: C.slate100 },
    line: { color: C.slate200, width: 0.7 },
  });
  text(
    slide,
    "표기 규칙  실선=동기 · 점선=비동기/관측 · Rose=대체/실패 · 각 호출에 timeout 또는 완료 조건 기입",
    1.03,
    6.48,
    10.66,
    0.17,
    { fontSize: 7.4, color: C.slate600, bold: true, align: "center" },
  );
}

// 26 · 비동기 이벤트
{
  const slide = addSlide({
    title: "비동기 이벤트는 전달 보장과 중복 처리까지 설계한다",
    subtitle: "선택형 예시 · Transactional outbox · broker · DLQ · replay",
    section: "WAS 선택형 예시",
    notes:
      "DB 트랜잭션에서 업무 데이터와 outbox 이벤트를 함께 기록한다. relay가 broker로 전달하고 consumer는 event-id를 이용해 멱등 처리한다. 실패는 DLQ에 보관하고 원인 수정 후 재처리한다.",
  });
  addNode(slide, {
    x: 0.68,
    y: 2.62,
    w: 1.79,
    icon: "WAS",
    label: "Order WAS",
    meta: "producer",
    accent: C.blue,
  });
  addNode(slide, {
    x: 3.0,
    y: 1.98,
    w: 1.9,
    icon: "DB",
    label: "Order tables",
    meta: "business data",
    accent: C.cyan,
  });
  addNode(slide, {
    x: 3.0,
    y: 3.58,
    w: 1.9,
    icon: "OUT",
    label: "Outbox table",
    meta: "same transaction",
    accent: C.violet,
  });
  addNode(slide, {
    x: 5.54,
    y: 3.58,
    w: 1.78,
    icon: "RLY",
    label: "Relay",
    meta: "poll / CDC",
    accent: C.violet,
  });
  addNode(slide, {
    x: 7.92,
    y: 3.58,
    w: 1.85,
    icon: "MQ",
    label: "Broker",
    meta: "partitioned topic",
    accent: C.violet,
  });
  const consumers = [
    ["NTF", "Notification", "email / push", C.blue],
    ["ANA", "Analytics", "warehouse", C.cyan],
    ["FUL", "Fulfillment", "workflow", C.emerald],
  ];
  consumers.forEach(([icon, label, meta, accent], index) => {
    addNode(slide, {
      x: 10.42,
      y: 1.68 + index * 1.37,
      w: 2.05,
      icon,
      label,
      meta,
      accent,
    });
  });
  addConnector(slide, {
    x: 2.47,
    y: 3.13,
    w: 0.53,
    h: -0.63,
    color: C.cyan,
    label: "TX",
    labelX: 2.55,
    labelY: 2.58,
    labelW: 0.48,
  });
  addConnector(slide, {
    x: 2.47,
    y: 3.13,
    w: 0.53,
    h: 0.95,
    color: C.violet,
  });
  addConnector(slide, {
    x: 4.9,
    y: 4.1,
    w: 0.64,
    color: C.violet,
    dash: "dash",
    label: "unpublished",
    labelY: 3.77,
    labelW: 0.88,
  });
  addConnector(slide, {
    x: 7.32,
    y: 4.1,
    w: 0.6,
    color: C.violet,
    dash: "dash",
    label: "publish",
    labelY: 3.77,
    labelW: 0.72,
  });
  consumers.forEach((_, index) => {
    addConnector(slide, {
      x: 9.77,
      y: 4.1,
      w: 0.65,
      h: 2.2 + index * 1.37 - 4.1,
      color: C.violet,
      dash: "dash",
    });
  });
  shape(slide, S.roundRect, 5.54, 5.47, 4.23, 0.67, {
    fill: { color: C.roseSoft },
    line: { color: C.rose, width: 0.9 },
  });
  text(slide, "DLQ + REPLAY", 5.8, 5.64, 1.11, 0.23, {
    fontSize: 8.5,
    color: C.rose,
    bold: true,
  });
  text(slide, "error context · retry count · operator approval", 6.93, 5.59, 2.57, 0.3, {
    fontSize: 7.2,
    color: C.slate600,
    fontFace: MONO,
    align: "right",
  });
  addConnector(slide, {
    x: 8.84,
    y: 4.61,
    w: 0,
    h: 0.86,
    color: C.rose,
    dash: "dash",
    label: "exhausted",
    labelX: 8.22,
    labelY: 4.96,
    labelW: 0.78,
  });
  const contracts = [
    ["Delivery", "at-least-once"],
    ["Ordering", "aggregate key"],
    ["Dedupe", "event-id inbox"],
    ["Schema", "version + compatibility"],
  ];
  contracts.forEach(([label, value], index) => {
    shape(slide, S.roundRect, 0.68 + index * 2.74, 6.36, 2.48, 0.36, {
      fill: { color: C.slate100 },
      line: { color: C.slate200, width: 0.7 },
    });
    text(slide, label, 0.82 + index * 2.74, 6.43, 0.74, 0.18, {
      fontSize: 7.2,
      color: C.slate500,
      bold: true,
    });
    text(slide, value, 1.48 + index * 2.74, 6.43, 1.46, 0.18, {
      fontSize: 7.3,
      color: C.violet,
      bold: true,
      fontFace: MONO,
      align: "right",
    });
  });
}

// 27 · 보안 경계
{
  const slide = addSlide({
    title: "보안은 신뢰 경계마다 다시 확인한다",
    subtitle: "선택형 예시 · identity · policy · secret · data classification",
    section: "WAS 선택형 예시",
    notes:
      "네트워크 위치만 신뢰하지 않는다. 외부 사용자, edge, service-to-service, data 계층마다 독립적으로 신원을 검증하고 권한을 제한한다. 비밀은 배포 job과 런타임 secret store에만 둔다.",
  });
  const bounds = [
    { x: 0.62, w: 2.32, title: "PUBLIC", accent: C.rose },
    { x: 3.2, w: 2.74, title: "EDGE / DMZ", accent: C.amber },
    { x: 6.2, w: 3.08, title: "SERVICE ZONE", accent: C.blue },
    { x: 9.54, w: 3.13, title: "DATA ZONE", accent: C.violet },
  ];
  bounds.forEach((bound) => {
    shape(slide, S.roundRect, bound.x, 1.72, bound.w, 4.64, {
      fill: { color: C.white },
      line: { color: bound.accent, width: 1, dash: "dash" },
    });
    addPill(slide, bound.title, bound.x + 0.2, 1.92, bound.w - 0.4, {
      fill: `${bound.accent}`,
      line: `${bound.accent}`,
      color: C.white,
    });
  });
  addNode(slide, {
    x: 0.88,
    y: 2.64,
    w: 1.8,
    icon: "USR",
    label: "User / Partner",
    meta: "untrusted input",
    accent: C.rose,
  });
  addNode(slide, {
    x: 3.58,
    y: 2.44,
    w: 1.98,
    icon: "WAF",
    label: "WAF / Gateway",
    meta: "OIDC · rate limit",
    accent: C.amber,
  });
  addNode(slide, {
    x: 3.58,
    y: 4.25,
    w: 1.98,
    icon: "IAM",
    label: "Identity",
    meta: "token issuer",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 6.62,
    y: 2.44,
    w: 2.24,
    icon: "WAS",
    label: "Service identity",
    meta: "mTLS · workload ID",
    accent: C.blue,
  });
  addNode(slide, {
    x: 6.62,
    y: 4.25,
    w: 2.24,
    icon: "POL",
    label: "Policy decision",
    meta: "RBAC / ABAC",
    accent: C.emerald,
  });
  addNode(slide, {
    x: 9.92,
    y: 2.44,
    w: 2.35,
    icon: "DB",
    label: "Encrypted data",
    meta: "at rest + in transit",
    accent: C.violet,
  });
  addNode(slide, {
    x: 9.92,
    y: 4.25,
    w: 2.35,
    icon: "KMS",
    label: "Secret / Key store",
    meta: "rotation · audit",
    accent: C.rose,
  });
  addConnector(slide, {
    x: 2.68,
    y: 3.17,
    w: 0.9,
    color: C.rose,
    label: "TLS + token",
    labelY: 2.82,
    labelW: 0.9,
  });
  addConnector(slide, {
    x: 5.56,
    y: 2.96,
    w: 1.06,
    color: C.blue,
    label: "verified claims",
    labelY: 2.61,
    labelW: 1.05,
  });
  addConnector(slide, {
    x: 8.86,
    y: 2.96,
    w: 1.06,
    color: C.violet,
    label: "least privilege",
    labelY: 2.61,
    labelW: 1.05,
  });
  const principles = [
    ["인증", "누구인가"],
    ["인가", "무엇을 할 수 있나"],
    ["분류", "어떤 데이터인가"],
    ["감사", "누가 무엇을 했나"],
  ];
  principles.forEach(([title, body], index) => {
    shape(slide, S.roundRect, 0.72 + index * 3.0, 6.5, 2.7, 0.3, {
      fill: { color: index === 3 ? C.ink : C.slate100 },
      line: { color: index === 3 ? C.ink : C.slate200, width: 0.7 },
    });
    text(slide, `${title} · ${body}`, 0.86 + index * 3.0, 6.56, 2.42, 0.17, {
      fontSize: 7.2,
      color: index === 3 ? C.white : C.slate600,
      bold: true,
      align: "center",
    });
  });
}

// 28 · HA
{
  const slide = addSlide({
    title: "고가용성은 중복보다 장애 단위를 먼저 정의한다",
    subtitle: "선택형 예시 · Multi-AZ · stateless · failover · RTO/RPO",
    section: "WAS 선택형 예시",
    notes:
      "AZ 장애, 인스턴스 장애, 의존 서비스 장애, 데이터 장애를 구분한다. WAS는 두 AZ에 stateless로 분산하고 DB는 동기/비동기 복제의 RPO를 명시한다. 외부 장애는 circuit breaker로 격리한다.",
  });
  addNode(slide, {
    x: 0.68,
    y: 3.02,
    w: 1.75,
    icon: "LB",
    label: "Global LB",
    meta: "health routing",
    accent: C.cyan,
  });
  const azs = [
    { x: 3.06, title: "AZ-A", accent: C.blue },
    { x: 6.25, title: "AZ-B", accent: C.emerald },
  ];
  azs.forEach((az, index) => {
    shape(slide, S.roundRect, az.x, 1.75, 2.78, 4.27, {
      fill: { color: index === 0 ? C.blueSoft : C.emeraldSoft, transparency: 58 },
      line: { color: az.accent, width: 1, dash: "dash" },
    });
    text(slide, az.title, az.x + 0.18, 1.94, 2.42, 0.24, {
      fontSize: 9,
      color: az.accent,
      bold: true,
      align: "center",
    });
    addNode(slide, {
      x: az.x + 0.34,
      y: 2.45,
      w: 2.1,
      icon: "WAS",
      label: `WAS ${index === 0 ? "A1 / A2" : "B1 / B2"}`,
      meta: "stateless pool",
      accent: az.accent,
    });
    addNode(slide, {
      x: az.x + 0.34,
      y: 4.17,
      w: 2.1,
      icon: index === 0 ? "PRI" : "REP",
      label: index === 0 ? "DB Primary" : "DB Replica",
      meta: index === 0 ? "write leader" : "failover target",
      accent: index === 0 ? C.violet : C.cyan,
    });
  });
  addNode(slide, {
    x: 9.72,
    y: 2.38,
    w: 2.54,
    icon: "EXT",
    label: "External dependency",
    meta: "circuit + fallback",
    accent: C.rose,
  });
  addNode(slide, {
    x: 9.72,
    y: 4.32,
    w: 2.54,
    icon: "BKP",
    label: "Backup / PITR",
    meta: "restore tested",
    accent: C.amber,
  });
  addConnector(slide, {
    x: 2.43,
    y: 3.54,
    w: 0.97,
    h: -0.57,
    color: C.blue,
  });
  addConnector(slide, {
    x: 2.43,
    y: 3.54,
    w: 4.16,
    h: -0.57,
    color: C.emerald,
  });
  addConnector(slide, {
    x: 5.84,
    y: 4.69,
    w: 0.75,
    color: C.violet,
    dash: "dash",
    label: "replication",
    labelY: 4.36,
    labelW: 0.92,
  });
  addConnector(slide, {
    x: 8.69,
    y: 2.97,
    w: 1.03,
    color: C.rose,
    dash: "dash",
    label: "bounded call",
    labelY: 2.63,
    labelW: 0.92,
  });
  addConnector(slide, {
    x: 7.3,
    y: 5.16,
    w: 2.42,
    h: -0.32,
    color: C.amber,
    dash: "dash",
    label: "backup",
    labelY: 4.72,
    labelW: 0.72,
  });
  const slos = [
    ["Availability", "99.95%", C.emerald],
    ["RTO", "≤ 30 min", C.blue],
    ["RPO", "≤ 5 min", C.violet],
    ["Failover drill", "Quarterly", C.amber],
  ];
  slos.forEach(([label, value, accent], index) => {
    addMetric(slide, {
      x: 0.68 + index * 3.02,
      y: 6.03,
      w: 2.71,
      value,
      label,
      accent,
    });
  });
}

// 29 · 관측성
{
  const slide = addSlide({
    title: "관측성은 로그·메트릭·트레이스를 하나의 요청으로 묶는다",
    subtitle: "선택형 예시 · OpenTelemetry · SLO · actionable alert",
    section: "WAS 선택형 예시",
    notes:
      "모든 요청에 trace-id, request-id, user-safe correlation-id를 전파한다. 애플리케이션은 구조화 로그, RED/USE 메트릭, span을 collector로 보낸다. 알람은 사용자 영향과 운영 조치가 있을 때만 만든다.",
  });
  const sources = [
    ["GW", "Gateway", C.emerald],
    ["WAS", "Services", C.blue],
    ["JOB", "Workers", C.violet],
    ["DB", "Database", C.cyan],
  ];
  sources.forEach(([icon, label, accent], index) => {
    addNode(slide, {
      x: 0.68,
      y: 1.65 + index * 1.08,
      w: 1.82,
      h: 0.88,
      icon,
      label,
      meta: "instrumented",
      accent,
    });
    const startY = 2.09 + index * 1.08;
    addConnector(slide, {
      x: 2.5,
      y: startY,
      w: 1.5,
      h: 3.77 - startY,
      color: C.slate400,
      dash: "dot",
      endArrowType: "triangle",
    });
  });
  addNode(slide, {
    x: 4.0,
    y: 3.21,
    w: 2.1,
    h: 1.12,
    icon: "OTEL",
    label: "Telemetry Collector",
    meta: "batch · redact · route",
    accent: C.amber,
  });
  const pillars = [
    { x: 7.04, icon: "LOG", label: "Logs", meta: "structured events", accent: C.blue },
    { x: 9.02, icon: "MET", label: "Metrics", meta: "RED · USE · SLO", accent: C.emerald },
    { x: 11.0, icon: "TRC", label: "Traces", meta: "cross-service", accent: C.violet },
  ];
  pillars.forEach((pillar) => {
    addNode(slide, {
      x: pillar.x,
      y: 2.2,
      w: 1.62,
      ...pillar,
    });
    addConnector(slide, {
      x: 6.1,
      y: 3.77,
      w: pillar.x - 6.1,
      h: 2.71 - 3.77,
      color: pillar.accent,
      dash: "dot",
    });
  });
  shape(slide, S.roundRect, 7.04, 4.2, 5.58, 1.17, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(slide, "CORRELATION CONTRACT", 7.3, 4.42, 1.75, 0.22, {
    fontSize: 8.4,
    color: C.cyan,
    bold: true,
    charSpacing: 0.7,
  });
  text(
    slide,
    "trace_id · span_id · request_id · service · version · environment",
    7.3,
    4.78,
    5.05,
    0.26,
    {
      fontSize: 7.8,
      color: C.white,
      fontFace: MONO,
      bold: true,
      align: "center",
    },
  );
  const signals = [
    ["RATE", "요청량 / 처리량", C.blue],
    ["ERROR", "실패율 / 분류", C.rose],
    ["DURATION", "p50 · p95 · p99", C.violet],
    ["SATURATION", "CPU · pool · queue", C.amber],
  ];
  signals.forEach(([title, body, accent], index) => {
    shape(slide, S.roundRect, 0.68 + index * 3.02, 6.03, 2.71, 0.63, {
      fill: { color: C.white },
      line: { color: accent, width: 0.9 },
    });
    text(slide, title, 0.85 + index * 3.02, 6.15, 0.89, 0.2, {
      fontSize: 7.6,
      color: accent,
      bold: true,
    });
    text(slide, body, 1.65 + index * 3.02, 6.13, 1.53, 0.24, {
      fontSize: 7.4,
      color: C.slate600,
      align: "right",
    });
  });
}

// 30 · 의사결정
{
  const slide = addSlide({
    title: "통신 방식은 업무 일관성과 시간 결합도로 결정한다",
    subtitle: "선택형 예시 · Sync vs Async vs Batch",
    section: "WAS 선택형 예시",
    notes:
      "응답 즉시성이 필요하고 하위 결과가 현재 트랜잭션에 필수면 동기를 고려한다. 느슨한 결합, 버퍼링, 팬아웃이 중요하면 비동기 이벤트를 고려한다. 대량 재처리와 시간 창 기반 처리는 배치가 적합하다.",
  });
  addDecisionTable(slide, {
    x: 0.62,
    y: 1.75,
    widths: [2.3, 3.17, 3.17, 3.41],
    rows: [
      ["판단 기준", "동기 API", "비동기 이벤트", "배치 / 파일"],
      ["사용자 응답", "즉시 결과 필요", "접수 후 완료", "시간 창 이후"],
      ["결합도", "시간·가용성 결합", "스키마 결합", "포맷·스케줄 결합"],
      ["오류 처리", "timeout · retry · fallback", "DLQ · replay · dedupe", "부분 성공 · 재실행"],
      ["일관성", "강한 경계에 유리", "최종 일관성", "시점 기준 스냅샷"],
      ["확장성", "호출 체인에 제한", "버퍼·팬아웃에 유리", "대량 처리에 유리"],
      ["권장 사례", "조회·승인·즉시 검증", "알림·동기화·워크플로", "정산·이관·리포트"],
    ],
  });
  shape(slide, S.roundRect, 0.62, 5.58, 12.05, 0.98, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  addPill(slide, "ADR", 0.9, 5.84, 0.6, {
    fill: C.slate800,
    line: C.slate800,
    color: C.cyan,
  });
  text(slide, "결정 문장", 1.66, 5.83, 1.0, 0.24, {
    fontSize: 8.6,
    color: C.slate300,
    bold: true,
  });
  text(
    slide,
    "“결제 승인 결과는 사용자 응답에 필수이므로 800 ms timeout의 동기 API를 사용하고, 후속 알림은 outbox 이벤트로 분리한다.”",
    2.63,
    5.72,
    9.55,
    0.44,
    { fontSize: 9.3, color: C.white, bold: true, align: "center" },
  );
  text(
    slide,
    "기록할 것: Context · Decision · Alternatives · Consequences · Owner · Review date",
    0.76,
    6.73,
    11.9,
    0.2,
    { fontSize: 7.5, color: C.slate500, fontFace: MONO, align: "center" },
  );
}

// 31 · 로드맵
{
  const slide = addSlide({
    title: "구현 로드맵은 기능이 아니라 위험 감소 순서로 만든다",
    subtitle: "선택형 예시 · Foundation → Sync → Async → Operate",
    section: "WAS 선택형 예시",
    notes:
      "각 단계는 선행 위험을 제거하고 완료 조건을 가진다. 모든 시스템에 모든 단계를 적용할 필요는 없다. 현재 정적 구조만으로 충분하면 API/WAS 추가를 의사결정으로 보류할 수 있다.",
  });
  const phases = [
    {
      n: "00",
      title: "Keep static",
      period: "현재",
      body: "정적 배포로 요구 충족 여부 확인\n불필요한 WAS 추가 금지",
      done: "동적 요구 명확",
      accent: C.slate700,
    },
    {
      n: "01",
      title: "Foundation",
      period: "1–2주",
      body: "API contract · identity · SLO\nCI/CD · secret boundary",
      done: "설계 리뷰 승인",
      accent: C.blue,
    },
    {
      n: "02",
      title: "Sync path",
      period: "2–4주",
      body: "핵심 WAS · DB transaction\ntimeout · idempotency",
      done: "부하/장애 테스트",
      accent: C.cyan,
    },
    {
      n: "03",
      title: "Async path",
      period: "2–3주",
      body: "outbox · broker · consumer\nDLQ · replay runbook",
      done: "중복/재처리 검증",
      accent: C.violet,
    },
    {
      n: "04",
      title: "Operate",
      period: "지속",
      body: "SLO · alert · failover drill\ncost · capacity review",
      done: "운영 인수 완료",
      accent: C.emerald,
    },
  ];
  phases.forEach((phase, index) => {
    const x = 0.62 + index * 2.43;
    shape(slide, S.roundRect, x, 1.75, 2.18, 4.71, {
      fill: { color: index === 0 ? C.slate100 : C.white },
      line: { color: phase.accent, width: 1 },
      shadow,
    });
    shape(slide, S.roundRect, x, 1.75, 2.18, 0.71, {
      fill: { color: phase.accent },
      line: { color: phase.accent, width: 0 },
    });
    text(slide, phase.n, x + 0.16, 1.92, 0.38, 0.22, {
      fontSize: 8.5,
      color: C.white,
      bold: true,
    });
    text(slide, phase.period, x + 0.86, 1.92, 1.14, 0.22, {
      fontSize: 7.6,
      color: C.white,
      bold: true,
      align: "right",
    });
    text(slide, phase.title, x + 0.18, 2.75, 1.82, 0.38, {
      fontSize: 12.2,
      color: C.ink,
      bold: true,
      align: "center",
    });
    text(slide, phase.body, x + 0.2, 3.34, 1.78, 1.12, {
      fontSize: 8.1,
      color: C.slate600,
      valign: "top",
      align: "center",
    });
    shape(slide, S.line, x + 0.26, 4.73, 1.66, 0, {
      fill: { color: C.slate200 },
      line: { color: C.slate200, width: 0.8 },
    });
    text(slide, "DONE WHEN", x + 0.24, 5.02, 1.7, 0.2, {
      fontSize: 7,
      color: phase.accent,
      bold: true,
      align: "center",
      charSpacing: 0.5,
    });
    text(slide, phase.done, x + 0.22, 5.39, 1.74, 0.42, {
      fontSize: 8.2,
      color: C.slate700,
      bold: true,
      align: "center",
    });
    if (index < phases.length - 1) {
      addConnector(slide, {
        x: x + 2.18,
        y: 4.03,
        w: 0.25,
        color: C.slate300,
        width: 1.2,
      });
    }
  });
  shape(slide, S.roundRect, 0.62, 6.67, 12.05, 0.2, {
    fill: { color: C.slate200 },
    line: { color: C.slate200, width: 0 },
  });
}

// 32 · 체크리스트
{
  const slide = addSlide({
    title: "아키텍처 리뷰 체크리스트",
    subtitle: "한 장씩 복제하고, 답이 없는 항목만 다음 설계 과제로 남긴다.",
    section: "마무리",
    notes:
      "마무리 시 이 체크리스트를 사용한다. ‘현재 구조’와 ‘목표 구조’를 구분하고, 인터페이스·데이터·보안·장애·운영·배포·소유권의 답이 슬라이드 안에 있는지 확인한다.",
  });
  const checks = [
    ["01", "Context", "사용자·외부 시스템·경계가 보이는가?", C.blue],
    ["02", "Interface", "프로토콜·timeout·버전이 있는가?", C.cyan],
    ["03", "Data", "원장·복제·일관성·보존이 있는가?", C.violet],
    ["04", "Security", "신원·권한·비밀·감사가 있는가?", C.rose],
    ["05", "Resilience", "실패·재시도·복구·RTO/RPO가 있는가?", C.amber],
    ["06", "Observability", "SLO·신호·trace-id·알람이 있는가?", C.emerald],
    ["07", "Delivery", "검증·승인·롤백·아티팩트가 있는가?", C.blue],
    ["08", "Ownership", "운영자·결정권자·리뷰일이 있는가?", C.slate700],
  ];
  checks.forEach(([num, title, question, accent], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 0.62 + col * 6.08;
    const y = 1.75 + row * 0.98;
    shape(slide, S.roundRect, x, y, 5.77, 0.76, {
      fill: { color: C.white },
      line: { color: C.slate200, width: 0.8 },
      shadow,
    });
    shape(slide, S.ellipse, x + 0.18, y + 0.16, 0.44, 0.44, {
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    text(slide, "✓", x + 0.18, y + 0.16, 0.44, 0.39, {
      fontSize: 10,
      color: C.white,
      bold: true,
      align: "center",
    });
    text(slide, `${num} · ${title}`, x + 0.78, y + 0.12, 1.34, 0.25, {
      fontSize: 8.6,
      color: accent,
      bold: true,
    });
    text(slide, question, x + 2.05, y + 0.12, 3.44, 0.43, {
      fontSize: 8.4,
      color: C.slate700,
      bold: true,
      align: "right",
    });
  });
  shape(slide, S.roundRect, 0.62, 5.88, 12.05, 0.81, {
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  text(slide, "READY TO COMPOSE", 0.92, 6.11, 1.74, 0.24, {
    fontSize: 8.6,
    color: C.cyan,
    bold: true,
    charSpacing: 0.9,
  });
  text(
    slide,
    "컴포넌트 03–07 · EIAM 실제 예제 09–21 · WAS 선택형 예제 23–31",
    2.62,
    6.04,
    7.22,
    0.34,
    { fontSize: 9.6, color: C.white, bold: true, align: "center" },
  );
  addPill(slide, "COPY · EDIT · PRESENT", 10.14, 6.09, 2.14, {
    fill: C.blue,
    line: C.blue,
    color: C.white,
  });
}

await fs.mkdir(outputDir, { recursive: true });
await pptx.writeFile({ fileName: outputFile, compression: true });

const sectionCounts = Object.fromEntries(
  Array.from(new Set(slides.map((slide) => slide.section))).map((section) => [
    section,
    slides.filter((slide) => slide.section === section).length,
  ]),
);

await fs.writeFile(
  manifestFile,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      title: pptx.title,
      language: "ko-KR",
      aspectRatio: "16:9",
      slideCount: slides.length,
      editableVector: true,
      defaultFont: FONT,
      sourceIssue: 44,
      sourcePullRequest: 98,
      sections: sectionCounts,
      slides,
      output: path.basename(outputFile),
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${slides.length} slides: ${outputFile}`);
