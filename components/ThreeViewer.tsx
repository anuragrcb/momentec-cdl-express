"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface ThreeViewerProps {
  glbUrl: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  leftImageUrl?: string;
  rightImageUrl?: string;
}

export function ThreeViewer({
  glbUrl,
  frontImageUrl,
  backImageUrl,
  leftImageUrl,
  rightImageUrl,
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [loading, setLoading] = useState(true);

  const setView = (view: "front" | "back" | "left" | "right") => {
    if (!controlsRef.current || !cameraRef.current) return;
    const controls = controlsRef.current;
    const camera = cameraRef.current;

    switch (view) {
      case "front":
        camera.position.set(0, 0.9, 2.2);
        break;
      case "back":
        camera.position.set(0, 0.9, -2.2);
        break;
      case "left":
        camera.position.set(-2.2, 0.9, 0);
        break;
      case "right":
        camera.position.set(2.2, 0.9, 0);
        break;
    }
    controls.target.set(0, 0.6, 0);
    controls.update();
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setLoading(true);
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfcfcfc);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 100);
    camera.position.set(0, 0.9, 2.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    // Studio Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0xdde2e5, 1.2);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2, 3, 2.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-2, 2, 2);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 1.3);
    backLight.position.set(0, 2.5, -2.5);
    scene.add(backLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.6, 0);
    controls.maxDistance = 5.0;
    controls.minDistance = 0.8;
    controlsRef.current = controls;

    let frameId = 0;
    let disposed = false;

    // Optional texture preparation
    const texLoader = new THREE.TextureLoader();
    let frontTex: THREE.Texture | null = null;
    let backTex: THREE.Texture | null = null;

    if (frontImageUrl) {
      frontTex = texLoader.load(frontImageUrl);
      frontTex.colorSpace = THREE.SRGBColorSpace;
      frontTex.wrapS = THREE.ClampToEdgeWrapping;
      frontTex.wrapT = THREE.ClampToEdgeWrapping;
    }

    if (backImageUrl) {
      backTex = texLoader.load(backImageUrl);
      backTex.colorSpace = THREE.SRGBColorSpace;
      backTex.wrapS = THREE.ClampToEdgeWrapping;
      backTex.wrapT = THREE.ClampToEdgeWrapping;
    }

    new GLTFLoader().load(
      glbUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Apply textures to mesh if supplied
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const matName = (mesh.material as any)?.name?.toLowerCase() || mesh.name.toLowerCase();
            const isBack = matName.includes("reverse") || matName.includes("back") || matName.includes("rear");

            if (isBack && backTex) {
              const prevMat = mesh.material as THREE.MeshStandardMaterial;
              mesh.material = new THREE.MeshStandardMaterial({
                map: backTex,
                roughness: prevMat?.roughness ?? 0.6,
                metalness: prevMat?.metalness ?? 0.1,
                side: THREE.DoubleSide,
              });
            } else if (!isBack && frontTex) {
              const prevMat = mesh.material as THREE.MeshStandardMaterial;
              mesh.material = new THREE.MeshStandardMaterial({
                map: frontTex,
                roughness: prevMat?.roughness ?? 0.6,
                metalness: prevMat?.metalness ?? 0.1,
                side: THREE.DoubleSide,
              });
            }
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1.4 / maxDim;
        model.scale.setScalar(scale);

        const scaledCenter = center.clone().multiplyScalar(scale);
        model.position.sub(scaledCenter);
        model.position.y += 0.6;

        scene.add(model);
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("Failed to load 3D GLB model", err);
        setLoading(false);
      }
    );

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [glbUrl, frontImageUrl, backImageUrl, leftImageUrl, rightImageUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "520px", minHeight: "480px", background: "#fcfcfc", borderRadius: "8px", overflow: "hidden", border: "1px solid #e0e0dc" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.85)", zIndex: 10 }}>
          <strong>Loading 3D garment model &amp; applying artwork…</strong>
        </div>
      )}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* 3D View Angle Switcher */}
      <div style={{ position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "8px", zIndex: 5, background: "rgba(255,255,255,0.9)", padding: "6px 12px", borderRadius: "30px", boxShadow: "0 2px 10px rgba(0,0,0,0.12)", border: "1px solid #e0e0dc" }}>
        <button type="button" onClick={() => setView("front")} style={{ border: "none", background: "#111", color: "#fff", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          Front
        </button>
        <button type="button" onClick={() => setView("back")} style={{ border: "1px solid #ccc", background: "#fff", color: "#111", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          Back
        </button>
        <button type="button" onClick={() => setView("left")} style={{ border: "1px solid #ccc", background: "#fff", color: "#111", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          Left
        </button>
        <button type="button" onClick={() => setView("right")} style={{ border: "1px solid #ccc", background: "#fff", color: "#111", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          Right
        </button>
      </div>

      <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "11px", color: "#666", background: "rgba(255,255,255,0.85)", padding: "4px 8px", borderRadius: "4px" }}>
        Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
