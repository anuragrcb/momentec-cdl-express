"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Own clean implementation of the loading pattern used by the sibling
// 3d-garment-retexture project's public/index.html (three + GLTFLoader +
// OrbitControls) - written fresh for this app's UI, not copied.
export function ThreeViewer({ glbUrl }: { glbUrl: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f2);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 100);
    camera.position.set(0, 1.2, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    let frameId = 0;
    let disposed = false;

    new GLTFLoader().load(
      glbUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
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
        controls.target.set(0, 0.6, 0);
        camera.position.set(0, 0.9, 2.2);

        scene.add(model);
      },
      undefined,
      (err) => {
        console.error("Failed to load baked GLB", err);
      },
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
      mount.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
