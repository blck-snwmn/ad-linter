/**
 * 消費者庁ガイドラインPDFダウンローダー
 * 景品表示法関連のガイドライン・運用基準をダウンロード
 */

import axios, { AxiosError } from "axios";
import { writeFile, mkdir, access, readdir, unlink } from "fs/promises";
import { join } from "path";
import { loadPdf, type PdfDocument, PdfLoadError } from "./pdf.js";

/** ガイドラインダウンロード関連のエラー */
export class GuidelineDownloadError extends Error {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "GuidelineDownloadError";
  }
}

export interface GuidelineInfo {
  /** ガイドライン識別子 */
  id: string;
  /** ガイドライン名称 */
  title: string;
  /** ダウンロードURL */
  url: string;
  /** ファイル名 */
  filename: string;
  /** カテゴリ（価格表示/おとり広告/不実証広告 等） */
  category: string;
}

export interface DownloadedGuideline extends GuidelineInfo {
  /** ローカルファイルパス */
  localPath: string;
  /** ダウンロード日時 */
  downloadedAt: Date;
}

/**
 * 消費者庁ガイドラインPDF一覧（全32件）
 * https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/
 * 廃止されたものは除外
 */
export const GUIDELINE_PDFS: GuidelineInfo[] = [
  // === 指定告示関係 ===
  {
    id: "premium-designation",
    title: "景品類等の指定の告示の運用基準について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_240418_02.pdf",
    filename: "01-premium-designation.pdf",
    category: "指定告示関係",
  },
  {
    id: "premium-valuation",
    title: "景品類の価額の算定基準について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_21.pdf",
    filename: "02-premium-valuation.pdf",
    category: "指定告示関係",
  },
  // === 景品関係 ===
  {
    id: "general-premium-restriction",
    title: "「一般消費者に対する景品類の提供に関する事項の制限」の運用基準について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_22.pdf",
    filename: "03-general-premium-restriction.pdf",
    category: "景品関係",
  },
  {
    id: "lottery-premium-restriction",
    title: "「懸賞による景品類の提供に関する事項の制限」の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/120702premiums_1.pdf",
    filename: "04-lottery-premium-restriction.pdf",
    category: "景品関係",
  },
  {
    id: "internet-lottery",
    title: "インターネット上で行われる懸賞企画の取扱いについて",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_24.pdf",
    filename: "05-internet-lottery.pdf",
    category: "景品関係",
  },
  {
    id: "complete-gacha",
    title: "オンラインゲームの「コンプガチャ」と景品表示法の景品規制について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/120518premiums_1.pdf",
    filename: "06-complete-gacha.pdf",
    category: "景品関係",
  },
  // === 表示関係 ===
  {
    id: "origin-country",
    title: "「商品の原産国に関する不当な表示」の運用基準について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_26.pdf",
    filename: "07-origin-country.pdf",
    category: "表示関係",
  },
  {
    id: "origin-country-definition",
    title: "「商品の原産国に関する不当な表示」の原産国の定義に関する運用細則",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_27.pdf",
    filename: "08-origin-country-definition.pdf",
    category: "表示関係",
  },
  {
    id: "origin-country-clothing",
    title: "「商品の原産国に関する不当な表示」の衣料品の表示に関する運用細則",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_28.pdf",
    filename: "09-origin-country-clothing.pdf",
    category: "表示関係",
  },
  {
    id: "no-fruit-juice",
    title: "「無果汁の清涼飲料水等についての表示」に関する運用基準について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_29.pdf",
    filename: "10-no-fruit-juice.pdf",
    category: "表示関係",
  },
  {
    id: "consumer-credit",
    title: "「消費者信用の融資費用に関する不当な表示」の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_30.pdf",
    filename: "11-consumer-credit.pdf",
    category: "表示関係",
  },
  {
    id: "decoy-advertising",
    title: "「おとり広告に関する表示」等の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_31.pdf",
    filename: "12-decoy-advertising.pdf",
    category: "表示関係",
  },
  {
    id: "real-estate-decoy",
    title: "「不動産のおとり広告に関する表示」の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_32.pdf",
    filename: "13-real-estate-decoy.pdf",
    category: "表示関係",
  },
  {
    id: "nursing-home",
    title: "「有料老人ホームに関する不当な表示」の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_33.pdf",
    filename: "14-nursing-home.pdf",
    category: "表示関係",
  },
  {
    id: "stealth-marketing",
    title: "「一般消費者が事業者の表示であることを判別することが困難である表示」の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_230328_03.pdf",
    filename: "15-stealth-marketing.pdf",
    category: "表示関係",
  },
  {
    id: "unsubstantiated-claims",
    title: "不当景品類及び不当表示防止法第7条第2項の運用指針-不実証広告規制に関する指針-",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_34.pdf",
    filename: "16-unsubstantiated-claims.pdf",
    category: "表示関係",
  },
  {
    id: "price-display",
    title: "不当な価格表示についての景品表示法上の考え方",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_35.pdf",
    filename: "17-price-display.pdf",
    category: "表示関係",
  },
  {
    id: "future-price-comparison",
    title: "将来の販売価格を比較対照価格とする二重価格表示に対する執行方針",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_201225_01.pdf",
    filename: "18-future-price-comparison.pdf",
    category: "表示関係",
  },
  {
    id: "installment-price",
    title: "不当な割賦販売価格等の表示に関する不当景品類及び不当表示防止法第5条第2号の運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_36.pdf",
    filename: "19-installment-price.pdf",
    category: "表示関係",
  },
  {
    id: "comparison-advertising",
    title: "比較広告に関する景品表示法上の考え方",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_37.pdf",
    filename: "20-comparison-advertising.pdf",
    category: "表示関係",
  },
  {
    id: "ec-display",
    title: "消費者向け電子商取引における表示についての景品表示法上の問題点と留意事項",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/100121premiums_38.pdf",
    filename: "21-ec-display.pdf",
    category: "表示関係",
  },
  {
    id: "internet-advertising",
    title: "インターネット消費者取引に係る広告表示に関する景品表示法上の問題点及び留意事項",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_220629_07.pdf",
    filename: "22-internet-advertising.pdf",
    category: "表示関係",
  },
  {
    id: "menu-food-display",
    title: "メニュー・料理等の食品表示に係る景品表示法上の考え方について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/140328premiums_5.pdf",
    filename: "23-menu-food-display.pdf",
    category: "表示関係",
  },
  {
    id: "reduced-tax-price",
    title: "消費税の軽減税率制度の実施に伴う価格表示について",
    url: "https://www.caa.go.jp/policies/policy/representation/consumption_tax/pdf/consumption_tax_180518_0001.pdf",
    filename: "24-reduced-tax-price.pdf",
    category: "表示関係",
  },
  {
    id: "reduced-tax-price-appendix1",
    title: "【別紙1】消費税の軽減税率制度の実施に伴う価格表示について",
    url: "https://www.caa.go.jp/policies/policy/representation/consumption_tax/pdf/consumption_tax_180518_0002.pdf",
    filename: "25-reduced-tax-price-appendix1.pdf",
    category: "表示関係",
  },
  {
    id: "reduced-tax-price-appendix2",
    title: "【別紙2】消費税の軽減税率制度の実施に伴う価格表示について(概要)",
    url: "https://www.caa.go.jp/policies/policy/representation/consumption_tax/pdf/consumption_tax_180518_0003.pdf",
    filename: "26-reduced-tax-price-appendix2.pdf",
    category: "表示関係",
  },
  {
    id: "parking-fee",
    title: "時間貸し駐車場の料金表示について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/pdf/fair_labeling_171225_0001.pdf",
    filename: "27-parking-fee.pdf",
    category: "表示関係",
  },
  {
    id: "mobile-terminal-sales",
    title: "携帯電話等の移動系通信の端末の販売に関する店頭広告表示についての景品表示法上の考え方等の公表について",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/pdf/fair_labeling_181113_0001.pdf",
    filename: "28-mobile-terminal-sales.pdf",
    category: "表示関係",
  },
  {
    id: "mobile-terminal-mnp",
    title: "携帯電話端末の店頭広告表示等の適正化について～携帯電話端末の店頭広告表示とMNPにおける違約金の問題への対応～",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/information_other/2019/pdf/information_other_2019_190625_0001.pdf",
    filename: "29-mobile-terminal-mnp.pdf",
    category: "表示関係",
  },
  // === 課徴金関係 ===
  {
    id: "surcharge-requirements",
    title: "不当景品類及び不当表示防止法第8条(課徴金納付命令の基本的要件)に関する考え方",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_240418_03.pdf",
    filename: "30-surcharge-requirements.pdf",
    category: "課徴金関係",
  },
  // === 確約手続関係 ===
  {
    id: "commitment-procedure",
    title: "確約手続に関する運用基準",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_240418_04.pdf",
    filename: "31-commitment-procedure.pdf",
    category: "確約手続関係",
  },
  // === 違反事例集 ===
  {
    id: "violation-cases",
    title: "景品表示法における違反事例集",
    url: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/pdf/160225premiums_1.pdf",
    filename: "32-violation-cases.pdf",
    category: "違反事例集",
  },
];

/**
 * 単一のガイドラインPDFをダウンロード
 * @throws {GuidelineDownloadError} ダウンロード失敗時
 */
export async function downloadGuideline(
  info: GuidelineInfo,
  outputDir: string,
): Promise<DownloadedGuideline> {
  // 出力ディレクトリを作成
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (e) {
    throw new GuidelineDownloadError(
      `Failed to create output directory: ${outputDir}`,
      undefined,
      e instanceof Error ? e : undefined,
    );
  }

  const localPath = join(outputDir, info.filename);

  // PDFをダウンロード
  let data: Buffer;
  try {
    const response = await axios.get(info.url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AdLinter/1.0; +https://github.com/example/ad-linter)",
        Accept: "application/pdf",
      },
      timeout: 60000, // 60秒タイムアウト（PDFは大きい場合がある）
    });
    data = Buffer.from(response.data as ArrayBuffer);
  } catch (e) {
    if (e instanceof AxiosError) {
      if (e.response?.status === 404) {
        throw new GuidelineDownloadError(
          `Guideline PDF not found: ${info.url}`,
          info.url,
          e,
        );
      }
      throw new GuidelineDownloadError(
        `Failed to download guideline: ${e.message}`,
        info.url,
        e,
      );
    }
    throw new GuidelineDownloadError(
      `Failed to download guideline: ${e instanceof Error ? e.message : String(e)}`,
      info.url,
      e instanceof Error ? e : undefined,
    );
  }

  // PDFの基本検証
  if (data.length < 1000) {
    throw new GuidelineDownloadError(
      `Downloaded file is too small (${data.length} bytes), may be invalid: ${info.url}`,
      info.url,
    );
  }

  // PDFヘッダーの検証
  const header = data.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new GuidelineDownloadError(
      `Downloaded file does not appear to be a valid PDF: ${info.url}`,
      info.url,
    );
  }

  // ファイルに保存
  try {
    await writeFile(localPath, data);
  } catch (e) {
    throw new GuidelineDownloadError(
      `Failed to save PDF to ${localPath}: ${e instanceof Error ? e.message : String(e)}`,
      info.url,
      e instanceof Error ? e : undefined,
    );
  }

  return {
    ...info,
    localPath,
    downloadedAt: new Date(),
  };
}

/**
 * 全ガイドラインをダウンロード
 * 一部失敗しても続行し、結果を返す
 */
export async function downloadAllGuidelines(
  outputDir: string,
  options: { forceRedownload?: boolean } = {},
): Promise<{
  downloaded: DownloadedGuideline[];
  skipped: GuidelineInfo[];
  errors: GuidelineDownloadError[];
}> {
  const { forceRedownload = false } = options;

  const downloaded: DownloadedGuideline[] = [];
  const skipped: GuidelineInfo[] = [];
  const errors: GuidelineDownloadError[] = [];

  for (const info of GUIDELINE_PDFS) {
    const localPath = join(outputDir, info.filename);

    // 既存ファイルのチェック
    if (!forceRedownload) {
      try {
        await access(localPath);
        // ファイルが存在する場合はスキップ
        skipped.push(info);
        continue;
      } catch {
        // ファイルが存在しない場合は続行
      }
    }

    try {
      const result = await downloadGuideline(info, outputDir);
      downloaded.push(result);
    } catch (e) {
      if (e instanceof GuidelineDownloadError) {
        errors.push(e);
      } else {
        errors.push(
          new GuidelineDownloadError(
            `Unexpected error downloading ${info.id}: ${e instanceof Error ? e.message : String(e)}`,
            info.url,
            e instanceof Error ? e : undefined,
          ),
        );
      }
    }
  }

  return { downloaded, skipped, errors };
}

/**
 * ダウンロード済みガイドラインを読み込み
 */
export async function loadDownloadedGuidelines(
  outputDir: string,
): Promise<{
  documents: (PdfDocument & { guidelineInfo: GuidelineInfo })[];
  errors: (PdfLoadError | GuidelineDownloadError)[];
}> {
  const documents: (PdfDocument & { guidelineInfo: GuidelineInfo })[] = [];
  const errors: (PdfLoadError | GuidelineDownloadError)[] = [];

  // ディレクトリの存在確認
  try {
    await access(outputDir);
  } catch {
    return { documents, errors: [] };
  }

  for (const info of GUIDELINE_PDFS) {
    const localPath = join(outputDir, info.filename);

    try {
      await access(localPath);
    } catch {
      // ファイルが存在しない場合はスキップ
      continue;
    }

    try {
      const doc = await loadPdf(localPath);
      documents.push({
        ...doc,
        guidelineInfo: info,
      });
    } catch (e) {
      if (e instanceof PdfLoadError) {
        errors.push(e);
      } else {
        errors.push(
          new PdfLoadError(
            `Failed to load guideline PDF: ${e instanceof Error ? e.message : String(e)}`,
            localPath,
            e instanceof Error ? e : undefined,
          ),
        );
      }
    }
  }

  return { documents, errors };
}

/**
 * ダウンロード済みガイドラインをクリア
 */
export async function clearDownloadedGuidelines(outputDir: string): Promise<number> {
  let cleared = 0;

  try {
    const files = await readdir(outputDir);
    for (const file of files) {
      if (file.endsWith(".pdf")) {
        await unlink(join(outputDir, file));
        cleared++;
      }
    }
  } catch {
    // ディレクトリが存在しない場合は無視
  }

  return cleared;
}
