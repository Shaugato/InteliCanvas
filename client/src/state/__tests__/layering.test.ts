import { describe, it, expect } from "vitest";
import { computeOrderKey, isBackdrop, getDefaultBounds, hasFullCanvasIntent, HORIZON_Y } from "@shared/layering";

describe("Layering Module", () => {
  describe("isBackdrop", () => {
    it("identifies backdrop tags", () => {
      expect(isBackdrop("sky")).toBe(true);
      expect(isBackdrop("grass")).toBe(true);
      expect(isBackdrop("field")).toBe(true);
      expect(isBackdrop("ground")).toBe(true);
      expect(isBackdrop("water")).toBe(true);
      expect(isBackdrop("sand")).toBe(true);
      expect(isBackdrop("backdrop")).toBe(true);
    });

    it("returns false for non-backdrop tags", () => {
      expect(isBackdrop("tree")).toBe(false);
      expect(isBackdrop("sun")).toBe(false);
      expect(isBackdrop("house")).toBe(false);
      expect(isBackdrop("bird")).toBe(false);
      expect(isBackdrop(undefined)).toBe(false);
    });
  });

  describe("computeOrderKey", () => {
    it("sky layer has lowest priority", () => {
      expect(computeOrderKey("sky", "sky")).toBeLessThan(computeOrderKey("background", "tree"));
    });

    it("backdrop objects render before non-backdrop in same layer", () => {
      const skyBackdrop = computeOrderKey("sky", "sky");
      const sunInSky = computeOrderKey("sky", "sun");
      expect(skyBackdrop).toBeLessThan(sunInSky);
    });

    it("maintains layer order: sky < background < ground < foreground", () => {
      const sky = computeOrderKey("sky", "tree");
      const bg = computeOrderKey("background", "tree");
      const ground = computeOrderKey("ground", "tree");
      const fg = computeOrderKey("foreground", "tree");
      
      expect(sky).toBeLessThan(bg);
      expect(bg).toBeLessThan(ground);
      expect(ground).toBeLessThan(fg);
    });
  });

  describe("hasFullCanvasIntent", () => {
    it("detects full canvas phrases", () => {
      expect(hasFullCanvasIntent("cover the whole canvas")).toBe(true);
      expect(hasFullCanvasIntent("fill the entire canvas")).toBe(true);
      expect(hasFullCanvasIntent("top to bottom sky")).toBe(true);
      expect(hasFullCanvasIntent("make it full screen")).toBe(true);
      expect(hasFullCanvasIntent("cover everything")).toBe(true);
    });

    it("returns false for normal requests", () => {
      expect(hasFullCanvasIntent("add a tree")).toBe(false);
      expect(hasFullCanvasIntent("put a sky")).toBe(false);
      expect(hasFullCanvasIntent("draw the sun")).toBe(false);
    });
  });

  describe("getDefaultBounds", () => {
    it("sky defaults to top band", () => {
      const bounds = getDefaultBounds("sky", false);
      expect(bounds.y1).toBe(0);
      expect(bounds.y2).toBe(HORIZON_Y);
      expect(bounds.x1).toBe(0);
      expect(bounds.x2).toBe(100);
    });

    it("grass defaults to bottom band", () => {
      const bounds = getDefaultBounds("grass", false);
      expect(bounds.y1).toBe(HORIZON_Y);
      expect(bounds.y2).toBe(100);
      expect(bounds.x1).toBe(0);
      expect(bounds.x2).toBe(100);
    });

    it("full canvas override spans entire height", () => {
      const bounds = getDefaultBounds("sky", true);
      expect(bounds.y1).toBe(0);
      expect(bounds.y2).toBe(100);
    });
  });

  describe("sun visibility over sky", () => {
    it("sun added after sky should still render on top", () => {
      const skyKey = computeOrderKey("sky", "sky");
      const sunKey = computeOrderKey("sky", "sun");
      
      expect(sunKey).toBeGreaterThan(skyKey);
    });
  });
});
