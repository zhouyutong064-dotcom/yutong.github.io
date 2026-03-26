/**
 * splash.js - 开屏动画控制
 * 粒子背景 + 泡泡按钮交互 + 过渡进入主界面
 */
(function () {
  'use strict';

  // ---- 粒子系统 ----
  function initParticles(canvas) {
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });

    const COLORS = ['#60A5FA', '#A78BFA', '#34D399', '#F472B6', '#FBBF24'];
    const COUNT  = 60;

    const particles = Array.from({ length: COUNT }, () => ({
      x:    Math.random() * W,
      y:    Math.random() * H,
      r:    Math.random() * 2.2 + 0.4,
      vx:   (Math.random() - 0.5) * 0.5,
      vy:   (Math.random() - 0.5) * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.5 + 0.2,
    }));

    // 连线粒子
    const LINES = Array.from({ length: 15 }, () => ({
      x1: Math.random() * W, y1: Math.random() * H,
      x2: Math.random() * W, y2: Math.random() * H,
      vx1: (Math.random()-0.5)*0.3, vy1:(Math.random()-0.5)*0.3,
      vx2: (Math.random()-0.5)*0.3, vy2:(Math.random()-0.5)*0.3,
    }));

    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);

      // 连线
      LINES.forEach(l => {
        l.x1 += l.vx1; l.y1 += l.vy1;
        l.x2 += l.vx2; l.y2 += l.vy2;
        if (l.x1 < 0 || l.x1 > W) l.vx1 *= -1;
        if (l.y1 < 0 || l.y1 > H) l.vy1 *= -1;
        if (l.x2 < 0 || l.x2 > W) l.vx2 *= -1;
        if (l.y2 < 0 || l.y2 > H) l.vy2 *= -1;
        const grad = ctx.createLinearGradient(l.x1, l.y1, l.x2, l.y2);
        grad.addColorStop(0, 'rgba(99,102,241,0.12)');
        grad.addColorStop(1, 'rgba(96,165,250,0.06)');
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.8;
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
      });

      // 粒子
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2,'0');
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }

  // ---- 点击开启 ----
  function initSplash() {
    const splash   = document.getElementById('splashScreen');
    const btn      = document.getElementById('splashBtn');
    const app      = document.getElementById('appWrapper');
    const canvas   = document.getElementById('splashCanvas');

    if (!splash || !btn || !app) return;

    const stopParticles = initParticles(canvas);

    btn.addEventListener('click', () => {
      // 按钮点击爆炸效果
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        btn.style.transform = 'scale(1.08)';
        setTimeout(() => {
          // 开始消散
          splash.classList.add('hide');
          app.style.display = 'block';
          app.style.opacity = '0';
          app.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            app.style.opacity = '1';
          }, 50);
          setTimeout(() => {
            splash.style.display = 'none';
            stopParticles();
          }, 700);
        }, 120);
      }, 100);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSplash);
  } else {
    initSplash();
  }
})();
