import * as THREE from "three";

export function createHandMotion(model, scene, keys, options = {}) {
  const targets = Array.from({ length: 5 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x51cbff }),
    );
    scene.add(mesh);
    return mesh;
  });
  // Source axes: +X dorsal, -Y fingers, +Z toward little finger.
  const basis = new THREE.Matrix4().set(
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
  );
  model.quaternion.setFromRotationMatrix(basis);
  scene.add(model);
  scene.updateMatrixWorld(true);
  const wrist = model.getObjectByName("wrist");
  const wristBind = wrist.getWorldPosition(new THREE.Vector3());
  model.position.sub(wristBind);
  scene.updateMatrixWorld(true);
  let mesh;
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      mesh = o;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = new THREE.MeshStandardMaterial({
        color: 0xbd8d72,
        roughness: 0.63,
        metalness: 0,
      });
    }
  });
  if (!mesh || !wrist) throw new Error("Hand asset has no usable skeleton");
  const names = [
    "thumb",
    "index-finger",
    "middle-finger",
    "ring-finger",
    "pinky-finger",
  ];
  const chains = names.map((name, i) => {
    const suffixes =
      i === 0
        ? ["metacarpal", "phalanx-proximal", "phalanx-distal", "tip"]
        : [
            "metacarpal",
            "phalanx-proximal",
            "phalanx-intermediate",
            "phalanx-distal",
            "tip",
          ];
    const bones = suffixes.map((s) => model.getObjectByName(`${name}-${s}`));
    if (bones.some((b) => !b)) throw new Error(`Incomplete ${name} chain`);
    wrist.attach(bones[0]);
    for (let j = 1; j < bones.length; j++) bones[j - 1].attach(bones[j]);
    return bones;
  });
  scene.updateMatrixWorld(true);
  const wristRest = wrist.quaternion.clone();
  const wristAxes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ].map((v) =>
    v.applyQuaternion(
      wrist.getWorldQuaternion(new THREE.Quaternion()).invert(),
    ),
  );
  const specs = chains.map((chain, i) => {
    const dofs = [];
    // MCP flexion/splay and IP flexion. The thumb has a separate opposition DOF.
    for (let j = i === 0 ? 0 : 1; j < chain.length - 1; j++) {
      const bone = chain[j],
        inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      dofs.push({
        bone,
        rest: bone.quaternion.clone(),
        axis: new THREE.Vector3(
          i === 0 ? 0 : 1,
          0,
          i === 0 ? 1 : 0,
        ).applyQuaternion(inv),
        angle: 0,
        min: i === 0 ? -1.1 : -1.55,
        max: i === 0 ? 0.4 : 0.12,
        restAngle: i === 0 ? -0.25 : j === 1 ? -0.4 : -0.52,
      });
      if (j === (i === 0 ? 0 : 1))
        dofs.push({
          bone,
          rest: bone.quaternion.clone(),
          axis: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
          angle: 0,
          min: i === 0 ? -1.1 : -0.45,
          max: i === 0 ? 1.1 : 0.45,
          restAngle: 0,
        });
      if (i === 0 && j === 0)
        dofs.push({
          bone,
          rest: bone.quaternion.clone(),
          axis: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
          angle: 0,
          min: -0.7,
          max: 0.7,
          restAngle: 0,
        });
    }
    return { chain, dofs, tip: chain.at(-1) };
  });
  const sourceRest = new Map(
    specs.flatMap((s) => s.dofs.map((d) => [d.bone, d.rest])),
  );
  function apply(spec) {
    for (const [bone, rest] of sourceRest)
      if (spec.chain.includes(bone)) bone.quaternion.copy(rest);
    for (const d of spec.dofs)
      d.bone.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(d.axis, d.angle),
      );
    wrist.updateMatrixWorld(true);
  }
  const ease = (t) => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const clamp = THREE.MathUtils.clamp;
  function sequence(exercise) {
    if (options.sequences?.[exercise]) return options.sequences[exercise];
    if (exercise === "chords")
      return [
        [60, 64, 67],
        [62, 65, 69],
        [59, 62, 67],
        [60, 64, 67],
      ].flatMap((chord, n) =>
        chord.map((pitch, j) => ({
          pitch,
          finger: [0, 2, 4][j],
          start: 1 + n * 2,
          end: 2.3 + n * 2,
        })),
      );
    const pitches =
      exercise === "crossing"
        ? [64, 65, 67, 65, 64, 62, 60]
        : [60, 62, 64, 65, 67, 69, 71, 72];
    const fingering =
      exercise === "crossing"
        ? [2, 0, 1, 0, 2, 1, 0]
        : [0, 1, 2, 0, 1, 2, 3, 4];
    return pitches.map((pitch, i) => ({
      pitch,
      finger: fingering[i],
      start: 1 + i * 0.82,
      end: 1 + i * 0.82 + 0.67,
    }));
  }
  function keyContact(pitch, finger = 2) {
    const key = keys.get(pitch);
    return new THREE.Vector3(
      key.x,
      key.black ? 0.025 : 0.007,
      key.black ? -0.09 : [-0.012, -0.055, -0.065, -0.055, -0.035][finger],
    );
  }
  function solve(spec, target, weight, iterations = 28) {
    for (let iter = 0; iter < iterations; iter++) {
      for (const d of spec.dofs) {
        const old = d.angle,
          tip = spec.tip.getWorldPosition(new THREE.Vector3()),
          delta = 0.002;
        d.angle = old + delta;
        apply(spec);
        const derivative = spec.tip
          .getWorldPosition(new THREE.Vector3())
          .sub(tip)
          .multiplyScalar(1 / delta);
        const correction =
          target.clone().sub(tip).dot(derivative) /
          (derivative.lengthSq() + 0.00002);
        d.angle = clamp(
          old + clamp(correction, -0.18, 0.18) * weight,
          d.min,
          d.max,
        );
        apply(spec);
      }
    }
    return spec.tip.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  }
  function sample(t, exercise = "scale", showTargets = false) {
    const events = sequence(exercise);
    for (const { mesh, black } of keys.values())
      mesh.material.color.setHex(black ? 0x141619 : 0xe5e3dd);
    // A continuous phrase path anticipates the next position. Key presses do not
    // independently drag the palm; thumb-under uses the thumb's own opposition.
    const centers = [];
    for (const event of events) {
      const group = events.filter((e) => e.start === event.start);
      if (centers.some((c) => c.t === event.start - 0.05)) continue;
      centers.push({
        t: event.start - 0.05,
        hold: event.end - 0.1,
        x:
          group.reduce(
            (sum, e) =>
              sum +
              keyContact(e.pitch).x -
              [-0.025, -0.024, 0, 0.028, 0.05][e.finger],
            0,
          ) / group.length,
      });
    }
    let x = centers[0].x;
    for (let i = 1; i < centers.length; i++) {
      if (t >= centers[i].t) x = centers[i].x;
      else {
        x = THREE.MathUtils.lerp(
          x,
          centers[i].x,
          ease(
            (t - centers[i - 1].hold) / (centers[i].t - centers[i - 1].hold),
          ),
        );
        break;
      }
    }
    if (options.sequences?.[exercise]) {
      const active = events.filter((e) => t >= e.start && t < e.end);
      const group = active.length
        ? active
        : [events.find((e) => e.start > t) ?? events.at(-1)];
      x =
        group.reduce(
          (sum, e) =>
            sum +
            keyContact(e.pitch).x -
            [-0.025, -0.024, 0, 0.028, 0.05][e.finger],
          0,
        ) / group.length;
    }
    model.position.x = x - wristBind.x;
    model.position.y = 0.047 - wristBind.y;
    model.position.z = 0.052 - wristBind.z;
    wrist.quaternion.copy(wristRest);
    const pulse = events.reduce(
      (max, e) =>
        Math.max(
          max,
          Math.sin(Math.PI * clamp((t - e.start + 0.22) / 0.5, 0, 1)),
        ),
      0,
    );
    wrist.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        wristAxes[0],
        -0.04 + pulse * 0.05,
      ),
    );
    // Roll follows the phrase direction rather than an unrelated idle oscillation.
    const direction = centers.find((c) => c.t > t);
    const roll = direction ? clamp((direction.x - x) * 1.2, -0.06, 0.06) : 0;
    wrist.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(wristAxes[2], roll),
    );
    wrist.updateMatrixWorld(true);
    let worst = 0,
      held = 0;
    const plannedPosition = model.position.clone();
    for (let pass = 0; pass < 16; pass++) {
      const correction = new THREE.Vector3();
      let contactWeight = 0;
      worst = 0;
      held = 0;
      specs.forEach((spec, i) => {
        for (const d of spec.dofs) d.angle = d.restAngle;
        apply(spec);
        const rest =
          i === 0
            ? wrist
                .getWorldPosition(new THREE.Vector3())
                .add(new THREE.Vector3(-0.055, -0.025, -0.08))
            : spec.tip.getWorldPosition(new THREE.Vector3());
        if (i === 0) solve(spec, rest, 1);
        let target = rest,
          weight = 0,
          active = false;
        const upcoming =
          events.find((e) => e.finger === i && t >= e.start && t < e.end) ??
          events
            .filter(
              (e) => e.finger === i && t >= e.start - 0.3 && t <= e.end + 0.26,
            )
            .at(-1);
        if (upcoming) {
          active = t >= upcoming.start && t <= upcoming.end;
          weight =
            t < upcoming.start
              ? ease((t - upcoming.start + 0.3) / 0.3)
              : t > upcoming.end
                ? 1 - ease((t - upcoming.end) / 0.26)
                : 1;
          target = rest.clone().lerp(keyContact(upcoming.pitch, i), weight);
          if (active)
            keys.get(upcoming.pitch).mesh.material.color.setHex(0x8faec4);
          const error = solve(spec, target, 1);
          correction.add(
            target
              .clone()
              .sub(spec.tip.getWorldPosition(new THREE.Vector3()))
              .multiplyScalar(weight),
          );
          contactWeight += weight;
          if (active) {
            worst = Math.max(worst, error);
            held++;
          }
        }
        targets[i].visible = showTargets && weight > 0;
        targets[i].position.copy(target);
      });
      if (pass < 15 && contactWeight > 0) {
        // Solve the palm and fingers together; keep the wrist inside a small envelope
        // around the phrase path instead of stretching finger bones to reach a key.
        correction.multiplyScalar(0.7 / Math.max(1, contactWeight));
        model.position.add(correction);
        const displacement = model.position.clone().sub(plannedPosition);
        displacement.clampLength(0, 0.05);
        model.position.copy(plannedPosition).add(displacement);
        model.updateMatrixWorld(true);
      }
    }
    mesh.skeleton.update();
    return {
      worst,
      held,
      wristPosition: wrist.getWorldPosition(new THREE.Vector3()),
      tips: specs.map((s) => s.tip.getWorldPosition(new THREE.Vector3())),
    };
  }

  // Solve each exercise's poses once. Playback interpolates those fixed solutions,
  // so tiny timing changes cannot select a different IK branch for the wrist.
  const clips = new Map();
  const bones = [wrist, ...chains.flat()];
  function capture(t, exercise) {
    sample(t, exercise);
    return {
      position: model.position.clone(),
      rotations: bones.map((bone) => bone.quaternion.clone()),
      angles: specs.map((spec) => spec.dofs.map((dof) => dof.angle)),
    };
  }
  function getClip(exercise) {
    if (clips.has(exercise)) return clips.get(exercise);
    const events = sequence(exercise);
    if (options.sequences?.[exercise]) {
      const boundaries = [
        ...new Set(events.flatMap((e) => [e.start, e.end])),
      ].sort((a, b) => a - b);
      const groups = boundaries.slice(0, -1).map((start, i) => ({
        start,
        end: boundaries[i + 1],
        pose: capture((start + boundaries[i + 1]) / 2, exercise),
      }));
      const clip = {
        groups,
        restStart: capture(0, exercise),
        restEnd: capture(boundaries.at(-1) + 0.5, exercise),
        performance: true,
      };
      clips.set(exercise, clip);
      return clip;
    }
    const groups = [...new Set(events.map((event) => event.start))].map(
      (start) => {
        const notes = events.filter((event) => event.start === start);
        return {
          start,
          end: Math.max(...notes.map((event) => event.end)),
          pose: capture(start + 0.35, exercise),
        };
      },
    );
    const clip = {
      groups,
      restStart: capture(0, exercise),
      restEnd: capture(10, exercise),
    };
    clips.set(exercise, clip);
    return clip;
  }
  function playback(t, exercise = "scale", showTargets = false) {
    const clip = getClip(exercise),
      groups = clip.groups;
    let from = clip.restStart,
      to = groups[0].pose,
      blend = ease((t - (groups[0].start - 0.3)) / 0.3);
    if (clip.performance) {
      const anchors = [
        { time: groups[0].start - 0.25, pose: clip.restStart },
        ...groups.map((g) => ({ time: (g.start + g.end) / 2, pose: g.pose })),
        { time: groups.at(-1).end, pose: groups.at(-1).pose },
        { time: groups.at(-1).end + 0.35, pose: clip.restEnd },
      ];
      let index = anchors.findIndex((anchor) => anchor.time >= t);
      if (index < 0) index = anchors.length - 1;
      const before = anchors[Math.max(0, index - 1)],
        after = anchors[index];
      from = before.pose;
      to = after.pose;
      blend =
        before === after
          ? 0
          : ease((t - before.time) / (after.time - before.time));
    }
    for (let i = 0; !clip.performance && i < groups.length; i++) {
      const group = groups[i];
      if (t >= group.start + 0.05 && t <= group.end - 0.05) {
        from = to = group.pose;
        blend = 0;
        break;
      }
      if (t > group.end - 0.05) {
        from = group.pose;
        to = groups[i + 1]?.pose ?? clip.restEnd;
        const transitionEnd = groups[i + 1]
          ? groups[i + 1].start + 0.05
          : group.end + 0.35;
        blend = ease(
          (t - group.end + 0.05) / (transitionEnd - group.end + 0.05),
        );
      }
    }
    model.position.copy(from.position).lerp(to.position, blend);
    bones.forEach((bone, i) =>
      bone.quaternion.copy(from.rotations[i]).slerp(to.rotations[i], blend),
    );
    specs.forEach((spec, i) =>
      spec.dofs.forEach((dof, j) => {
        dof.angle = THREE.MathUtils.lerp(
          from.angles[i][j],
          to.angles[i][j],
          blend,
        );
      }),
    );
    model.updateMatrixWorld(true);
    if (clip.performance) {
      const base = model.position.clone();
      for (let pass = 0; pass < 8; pass++) {
        const correction = new THREE.Vector3();
        let total = 0;
        for (let finger = 0; finger < 5; finger++) {
          const event =
            sequence(exercise).find(
              (e) => e.finger === finger && t >= e.start && t < e.end,
            ) ??
            sequence(exercise).find(
              (e) =>
                e.finger === finger && t >= e.start - 0.12 && t < e.end + 0.12,
            );
          if (!event) continue;
          const weight =
            t < event.start
              ? ease((t - event.start + 0.12) / 0.12)
              : t >= event.end
                ? 1 - ease((t - event.end) / 0.12)
                : 1;
          const tip = specs[finger].tip.getWorldPosition(new THREE.Vector3());
          const target = tip
            .clone()
            .lerp(keyContact(event.pitch, finger), weight);
          solve(specs[finger], target, 1, 12);
          correction.add(
            target
              .sub(specs[finger].tip.getWorldPosition(new THREE.Vector3()))
              .multiplyScalar(weight),
          );
          total += weight;
        }
        if (total && pass < 7) {
          model.position.add(
            correction.multiplyScalar(0.7 / Math.max(1, total)),
          );
          const delta = model.position.clone().sub(base).clampLength(0, 0.03);
          model.position.copy(base).add(delta);
          model.updateMatrixWorld(true);
        }
      }
    }
    mesh.skeleton.update();
    for (const { mesh: keyMesh, black } of keys.values())
      keyMesh.material.color.setHex(black ? 0x141619 : 0xe5e3dd);
    targets.forEach((target) => {
      target.visible = false;
    });
    let worst = 0,
      held = 0;
    for (const event of sequence(exercise)) {
      if (t < event.start || t > event.end) continue;
      const target = keyContact(event.pitch, event.finger);
      solve(specs[event.finger], target, 1);
      worst = Math.max(
        worst,
        specs[event.finger].tip
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(target),
      );
      held++;
      keys.get(event.pitch).mesh.material.color.setHex(0x8faec4);
      targets[event.finger].position.copy(target);
      targets[event.finger].visible = showTargets;
    }
    mesh.skeleton.update();
    return {
      worst,
      held,
      wristPosition: wrist.getWorldPosition(new THREE.Vector3()),
      tips: specs.map((spec) => spec.tip.getWorldPosition(new THREE.Vector3())),
    };
  }
  return { sample: playback };
}
