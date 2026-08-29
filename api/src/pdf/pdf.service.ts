import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';

/**
 * One long-lived headless Chromium instance shared across requests (launched lazily on first
 * use), rather than spawning a new browser process per PDF — Puppeteer's launch cost is high
 * enough that per-request launches would make every PDF endpoint noticeably slow.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const puppeteer = await import('puppeteer');
      this.browserPromise = puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
    }
  }
}
