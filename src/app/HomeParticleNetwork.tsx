"use client";

import { useEffect, useRef } from "react";

type IconKind = "body" | "mind" | "work" | "laptop" | "heart" | "home" | "land" | "bike" | "car" | "book" | "task" | "star" | "leaf" | "target" | "sun";
type Point = { x: number; y: number; vx: number; vy: number; radius: number; phase: number; icon?: IconKind; iconColor?: string };
const OBJECT_ICONS: Array<{ kind: IconKind; color: string }> = [
  { kind: "body", color: "#e84f8a" },
  { kind: "mind", color: "#8d5ceb" },
  { kind: "work", color: "#27aaa1" },
  { kind: "laptop", color: "#e64b44" },
  { kind: "heart", color: "#f2a21c" },
  { kind: "home", color: "#528dd7" },
  { kind: "land", color: "#e84f8a" },
  { kind: "bike", color: "#8d5ceb" },
  { kind: "car", color: "#f2a21c" },
  { kind: "book", color: "#27aaa1" },
  { kind: "task", color: "#528dd7" },
  { kind: "star", color: "#f2a21c" },
  { kind: "leaf", color: "#27aaa1" },
  { kind: "target", color: "#e84f8a" },
  { kind: "sun", color: "#f2a21c" },
];

function drawObjectIcon(context: CanvasRenderingContext2D, point: Point) {
  if (!point.icon) return;
  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = point.iconColor || "#cfc3ff";
  context.lineWidth = 1.15;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (point.icon === "body") {
    context.arc(0, -3.3, 1.8, 0, Math.PI * 2);
    context.moveTo(-4.5, 5);
    context.quadraticCurveTo(-4, 0, 0, 0);
    context.quadraticCurveTo(4, 0, 4.5, 5);
    context.moveTo(0, 0);
    context.lineTo(0, 5.2);
  } else if (point.icon === "mind") {
    context.moveTo(0, 5);
    context.bezierCurveTo(-1, 2, -5, 3, -5, 0);
    context.bezierCurveTo(-6, -2, -4, -4, -2.5, -4);
    context.bezierCurveTo(-1.5, -6, 1, -5.5, 2, -4);
    context.bezierCurveTo(5, -4, 6, -1, 4.8, 0.5);
    context.bezierCurveTo(5, 3, 2, 3, 1, 5);
    context.moveTo(0, -4);
    context.lineTo(0, 4.5);
    context.moveTo(-3.5, -1);
    context.quadraticCurveTo(-1, -1, -1.5, 1);
    context.moveTo(3.5, -1.5);
    context.quadraticCurveTo(1, -1, 1.5, 1.5);
  } else if (point.icon === "work") {
    context.rect(-5, -2.5, 10, 7.5);
    context.moveTo(-2.2, -2.5);
    context.lineTo(-2.2, -4.5);
    context.lineTo(2.2, -4.5);
    context.lineTo(2.2, -2.5);
    context.moveTo(-5, 0);
    context.lineTo(5, 0);
  } else if (point.icon === "laptop") {
    context.rect(-4.5, -4, 9, 6.5);
    context.moveTo(-6, 4);
    context.lineTo(6, 4);
    context.lineTo(4.5, 2.5);
  } else if (point.icon === "heart") {
    context.moveTo(0, 5);
    context.bezierCurveTo(-1.3, 3.8, -5.5, 1, -5.5, -1.5);
    context.bezierCurveTo(-5.5, -5.5, -1, -5.5, 0, -2.5);
    context.bezierCurveTo(1, -5.5, 5.5, -5.5, 5.5, -1.5);
    context.bezierCurveTo(5.5, 1, 1.3, 3.8, 0, 5);
  } else if (point.icon === "home") {
    context.moveTo(-5.5, -0.5);
    context.lineTo(0, -5);
    context.lineTo(5.5, -0.5);
    context.lineTo(4, -0.5);
    context.lineTo(4, 5);
    context.lineTo(-4, 5);
    context.lineTo(-4, -0.5);
    context.closePath();
    context.moveTo(-1, 5);
    context.lineTo(-1, 1.5);
    context.lineTo(1.5, 1.5);
    context.lineTo(1.5, 5);
  } else if (point.icon === "land") {
    context.moveTo(-6, 4);
    context.lineTo(-2, -2);
    context.lineTo(0, 0);
    context.lineTo(3, -4.5);
    context.lineTo(6, 4);
    context.closePath();
    context.moveTo(-4, 4);
    context.lineTo(4.5, 4);
  } else if (point.icon === "bike") {
    context.arc(-4, 2.5, 2.6, 0, Math.PI * 2);
    context.moveTo(1.4, 2.5);
    context.arc(4, 2.5, 2.6, 0, Math.PI * 2);
    context.moveTo(-4, 2.5);
    context.lineTo(-1.5, -2);
    context.lineTo(1, 2.5);
    context.lineTo(-2.5, 2.5);
    context.lineTo(0, -1);
    context.lineTo(2.8, -1);
    context.moveTo(1.3, -2.2);
    context.lineTo(2.2, -2.2);
  } else if (point.icon === "car") {
    context.moveTo(-5.5, 2.5);
    context.lineTo(-4.5, -1);
    context.quadraticCurveTo(-4, -2.5, -2.5, -2.5);
    context.lineTo(2.5, -2.5);
    context.quadraticCurveTo(4, -2.5, 4.5, -1);
    context.lineTo(5.5, 2.5);
    context.lineTo(5.5, 4);
    context.lineTo(-5.5, 4);
    context.closePath();
    context.moveTo(-3.8, 4);
    context.arc(-3, 4, .8, 0, Math.PI * 2);
    context.moveTo(3.8, 4);
    context.arc(3, 4, .8, 0, Math.PI * 2);
  } else if (point.icon === "book") {
    context.moveTo(0, -4.5);
    context.quadraticCurveTo(-2.5, -5.5, -5, -4);
    context.lineTo(-5, 4.5);
    context.quadraticCurveTo(-2.3, 3.2, 0, 4.7);
    context.quadraticCurveTo(2.3, 3.2, 5, 4.5);
    context.lineTo(5, -4);
    context.quadraticCurveTo(2.5, -5.5, 0, -4.5);
    context.moveTo(0, -4.5);
    context.lineTo(0, 4.5);
  } else if (point.icon === "task") {
    context.rect(-4.5, -5, 9, 10);
    context.moveTo(-2.5, -2.5);
    context.lineTo(-1, -1);
    context.lineTo(1, -3);
    context.moveTo(2, -2);
    context.lineTo(3, -2);
    context.moveTo(-2.5, 2);
    context.lineTo(3, 2);
  } else if (point.icon === "star") {
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const outerX = Math.cos(angle) * 5;
      const outerY = Math.sin(angle) * 5;
      const innerAngle = angle + Math.PI / 5;
      const innerX = Math.cos(innerAngle) * 2.2;
      const innerY = Math.sin(innerAngle) * 2.2;
      if (i === 0) context.moveTo(outerX, outerY);
      else context.lineTo(outerX, outerY);
      context.lineTo(innerX, innerY);
    }
    context.closePath();
  } else if (point.icon === "leaf") {
    context.moveTo(-4.5, 4.5);
    context.bezierCurveTo(-5, -1, -2, -5, 5, -5);
    context.bezierCurveTo(5, 1, 2, 5, -4.5, 4.5);
    context.moveTo(-3.5, 3.5);
    context.lineTo(3.5, -3.5);
    context.moveTo(-1, 1);
    context.lineTo(-1.5, -2);
    context.moveTo(1, -1);
    context.lineTo(4, -1.5);
  } else if (point.icon === "target") {
    context.arc(0, 0, 5, 0, Math.PI * 2);
    context.moveTo(2.2, 0);
    context.arc(0, 0, 2.2, 0, Math.PI * 2);
    context.moveTo(1.5, -1.5);
    context.lineTo(5.5, -5.5);
    context.moveTo(3.2, -5.5);
    context.lineTo(5.5, -5.5);
    context.lineTo(5.5, -3.2);
  } else if (point.icon === "sun") {
    context.arc(0, 0, 2.5, 0, Math.PI * 2);
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      context.moveTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
      context.lineTo(Math.cos(angle) * 5.7, Math.sin(angle) * 5.7);
    }
  }
  context.stroke();
  context.restore();
}

export default function HomeParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let points: Point[] = [];
    let frame = 0;
    let previousTime = 0;
    let pointer: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };
    let seed = 41237;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed = 41237;
      const count = Math.max(22, Math.min(58, Math.round((width * height) / 24000)));
      points = Array.from({ length: count }, (_, index) => {
        const angle = random() * Math.PI * 2;
        const speed = 2 + random() * 5;
        return {
          x: random() * width,
          y: random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.4 + random() * 1.4,
          phase: random() * Math.PI * 2,
          ...(random() < 0.5 ? (() => {
            const icon = OBJECT_ICONS[Math.floor(random() * OBJECT_ICONS.length)];
            return { icon: icon.kind, iconColor: icon.color };
          })() : {}),
        };
      });
      draw();
      if (!reducedMotion.matches && !frame) frame = window.requestAnimationFrame(animate);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const connectionDistance = Math.max(78, Math.min(142, width / 12));
      const influenceRadius = Math.max(90, Math.min(170, width / 10));
      const visiblePoints = points.map((point) => {
        if (!pointer.active) return point;
        const dx = point.x - pointer.x;
        const dy = point.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (!distance || distance >= influenceRadius) return point;
        const strength = (1 - distance / influenceRadius) ** 2 * 30;
        return { ...point, x: point.x + dx / distance * strength, y: point.y + dy / distance * strength };
      });
      const links: Array<[number, number, number]> = [];
      const neighbors = visiblePoints.map(() => new Set<number>());
      for (let i = 0; i < visiblePoints.length; i += 1) {
        for (let j = i + 1; j < visiblePoints.length; j += 1) {
          const dx = visiblePoints[i].x - visiblePoints[j].x;
          const dy = visiblePoints[i].y - visiblePoints[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance < connectionDistance) {
            links.push([i, j, distance]);
            neighbors[i].add(j);
            neighbors[j].add(i);
          }
        }
      }

      context.lineWidth = 0.85;
      for (const [i, j, distance] of links) {
        const alpha = 0.08 + (1 - distance / connectionDistance) * 0.28;
        context.strokeStyle = `rgba(174, 158, 231, ${alpha})`;
        context.beginPath();
        context.moveTo(visiblePoints[i].x, visiblePoints[i].y);
        context.lineTo(visiblePoints[j].x, visiblePoints[j].y);
        context.stroke();
      }

      visiblePoints.forEach((point) => {
        if (point.icon) {
          drawObjectIcon(context, point);
          return;
        }
        context.beginPath();
        context.fillStyle = "rgba(208, 197, 255, 0.78)";
        context.shadowColor = "rgba(169, 145, 255, 0.62)";
        context.shadowBlur = 7;
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.shadowBlur = 0;
    };

    const animate = (time: number) => {
      frame = 0;
      const elapsed = Math.min((time - (previousTime || time)) / 1000, 0.04);
      previousTime = time;
      if (!reducedMotion.matches) {
        points.forEach((point) => {
          point.x += point.vx * elapsed;
          point.y += point.vy * elapsed;
          if (point.x < 0 || point.x > width) point.vx *= -1;
          if (point.y < 0 || point.y > height) point.vy *= -1;
          point.x = Math.max(0, Math.min(width, point.x));
          point.y = Math.max(0, Math.min(height, point.y));
        });
      }
      draw();
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.active = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (pointer.active) {
        pointer.x = event.clientX - bounds.left;
        pointer.y = event.clientY - bounds.top;
      }
      if (reducedMotion.matches) draw();
    };
    const handlePointerLeave = () => {
      pointer.active = false;
      if (reducedMotion.matches) draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    const handleMotionPreference = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);
      else draw();
    };
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="home-particle-network" />;
}
