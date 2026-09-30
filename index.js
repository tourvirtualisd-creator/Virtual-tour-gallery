/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  // Mark iPhone/iPod separately so the phone-specific minimap placement does not affect Android.
  if (/iPhone|iPod/i.test(navigator.userAgent)) {
    document.body.classList.add('ios-phone');
  }

  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;
  var branding = window.TOUR_BRANDING || {};

  // Branding elements are configured in branding.js so the property/client
  // information can be changed without touching the tour engine.
  var brandLogoElement = document.querySelector('#brandLogo .brandLogoImage');
  var brandLogoButton = document.querySelector('#brandLogo');
  var agencySocialPanel = document.querySelector('#agencySocialPanel');

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  sceneNameElement.textContent = branding.address || branding.title || '';
  if (branding.mapsUrl) {
    sceneNameElement.href = branding.mapsUrl;
    sceneNameElement.title = "Apri l'indirizzo in Google Maps";
  } else {
    sceneNameElement.removeAttribute('href');
  }
  if (brandLogoElement && branding.logo) {
    brandLogoElement.src = branding.logo;
    brandLogoElement.alt = branding.logoAlt || '';
  }
  // Agency contact panel: one configurable component, independent of browser/device.
  if (brandLogoButton && agencySocialPanel) {
    brandLogoButton.setAttribute('aria-label', 'Apri i contatti di ' + (branding.agencyName || branding.logoAlt || 'agenzia'));
    (branding.socialLinks || []).forEach(function(item) {
      if (!item || !item.url || !item.icon) { return; }
      var link = document.createElement('a');
      link.className = 'agencySocialLink';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('role', 'menuitem');
      link.setAttribute('aria-label', item.name || 'Contatto');
      link.title = item.name || '';
      var icon = document.createElement('img');
      icon.src = item.icon;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      link.appendChild(icon);
      agencySocialPanel.appendChild(link);
    });

    function setAgencyPanel(open) {
      agencySocialPanel.classList.toggle('enabled', open);
      agencySocialPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      brandLogoButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    brandLogoButton.addEventListener('click', function(event) {
      event.stopPropagation();
      setAgencyPanel(!agencySocialPanel.classList.contains('enabled'));
    });
    agencySocialPanel.addEventListener('click', function(event) { event.stopPropagation(); });
    document.addEventListener('click', function() { setAgencyPanel(false); });
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') { setAgencyPanel(false); }
    });
  }
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');


  // Approximate minimap positions. The map intentionally follows the hand-drawn
  // floor plan rather than pretending to be a measured architectural survey.
  var minimapPositions = {
    '0-ingresso':       [50, 89],
    '9-corridoio':      [50, 76],
    '8-corridoio':      [50, 52],
    '7-bagno':          [50, 18],
    '12-cucina':        [67, 76],
    '10-cucina':        [82, 85],
    '11-cucina':        [82, 63],
    '3-studio':         [68, 43],
    '1-studio':         [81, 24],
    '2-studio':         [66, 24],
    '6-camera-da-letto':[32, 43],
    '4-camera-da-letto':[18, 24],
    '5-camera-da-letto':[35, 24]
  };

  var minimapPanelElement = document.querySelector('#minimapPanel');
  var minimapToggleElement = document.querySelector('#minimapToggle');
  var minimapCloseElement = document.querySelector('#minimapClose');
  var minimapBackdropElement = minimapPanelElement.querySelector('.minimapBackdrop');
  var minimapPointsElement = document.querySelector('#minimapPoints');
  var minimapImageElement = document.querySelector('#minimapImage');
  var minimapFloorButtons = document.querySelectorAll('.minimapFloorButton');

  // Prototype for multi-floor buildings: for now all floors use the same supplied
  // plan, with different orientations, so we can evaluate the floor selector UI
  // before introducing real floor-plan images.
  function setMinimapFloor(floorIndex) {
    if (!minimapImageElement) return;
    floorIndex = String(floorIndex);
    var labels = ['Piano 1', 'Piano 2', 'Piano 3'];
    var floorImages = ['img/minimap-plan.png', 'img/minimap-floor-2.png', 'img/minimap-floor-3.png'];
    var index = Math.max(0, Math.min(2, parseInt(floorIndex, 10) || 0));
    minimapImageElement.src = floorImages[index];
    minimapImageElement.alt = 'Planimetria del ' + labels[index];
    minimapFloorButtons.forEach(function(button) {
      var active = button.getAttribute('data-floor') === String(index);
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  minimapFloorButtons.forEach(function(button) {
    button.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      setMinimapFloor(button.getAttribute('data-floor'));
    });
  });

  function updateMinimap(scene) {
    if (!minimapPointsElement || !scene) return;
    var sceneId = scene.data.id;
    var ns = 'http://www.w3.org/2000/svg';
    while (minimapPointsElement.firstChild) {
      minimapPointsElement.removeChild(minimapPointsElement.firstChild);
    }

    // Draw all panorama locations as subtle dots, with the current panorama
    // highlighted. This makes the map useful without making it visually busy.
    Object.keys(minimapPositions).forEach(function(id) {
      var pos = minimapPositions[id];
      var group = document.createElementNS(ns, 'g');
      group.setAttribute('class', 'minimapPoint' + (id === sceneId ? ' current' : ''));
      group.setAttribute('data-scene-id', id);

      var halo = document.createElementNS(ns, 'circle');
      halo.setAttribute('class', 'pointHalo');
      halo.setAttribute('cx', pos[0]);
      halo.setAttribute('cy', pos[1]);
      halo.setAttribute('r', id === sceneId ? '2.9' : '2.1');
      group.appendChild(halo);

      var core = document.createElementNS(ns, 'circle');
      core.setAttribute('class', 'pointCore');
      core.setAttribute('cx', pos[0]);
      core.setAttribute('cy', pos[1]);
      core.setAttribute('r', id === sceneId ? '1.65' : '1.15');
      group.appendChild(core);

      group.addEventListener('click', function(event) {
        event.stopPropagation();
        if (id === currentScene.data.id) return;
        var targetScene = findSceneById(id);
        if (!targetScene) return;
        hideMinimap();
        preloadFirstLevel(targetScene).then(function() {
          switchScene(targetScene, currentScene);
        });
      });

      minimapPointsElement.appendChild(group);
    });
  }

  function showMinimap() {
    if (!minimapPanelElement) return;
    updateMinimap(currentScene);
    minimapPanelElement.classList.add('enabled');
    minimapPanelElement.setAttribute('aria-hidden', 'false');
    if (minimapToggleElement) minimapToggleElement.classList.add('enabled');
  }

  function hideMinimap() {
    if (!minimapPanelElement) return;
    minimapPanelElement.classList.remove('enabled');
    minimapPanelElement.setAttribute('aria-hidden', 'true');
    if (minimapToggleElement) minimapToggleElement.classList.remove('enabled');
  }

  if (minimapToggleElement) {
    minimapToggleElement.addEventListener('click', function(event) {
      event.preventDefault();
      if (minimapPanelElement.classList.contains('enabled')) hideMinimap();
      else showMinimap();
    });
  }
  if (minimapCloseElement) minimapCloseElement.addEventListener('click', hideMinimap);
  if (minimapBackdropElement) minimapBackdropElement.addEventListener('click', hideMinimap);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') hideMinimap();
  });

  // Desktop/tablet: replace the browser scrollbar with a minimal custom
  // thumb so Chrome/Edge/Firefox cannot render native up/down arrow buttons.
  function initSceneScrollBar() {
    if (!document.body.classList.contains('desktop')) return;
    var scroller = sceneListElement.querySelector('.scenes');
    if (!scroller || sceneListElement.querySelector('.sceneScrollBar')) return;

    var bar = document.createElement('div');
    bar.className = 'sceneScrollBar';
    var track = document.createElement('div');
    track.className = 'sceneScrollBarTrack';
    var thumb = document.createElement('div');
    thumb.className = 'sceneScrollBarThumb';
    track.appendChild(thumb);
    bar.appendChild(track);
    sceneListElement.appendChild(bar);

    function update() {
      var viewport = scroller.clientHeight;
      var content = scroller.scrollHeight;
      var trackHeight = track.clientHeight;
      if (!viewport || content <= viewport || !trackHeight) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'block';
      var thumbHeight = Math.max(34, trackHeight * viewport / content);
      thumb.style.height = thumbHeight + 'px';
      var maxTop = Math.max(0, trackHeight - thumbHeight);
      var maxScroll = content - viewport;
      thumb.style.top = (maxScroll ? (scroller.scrollTop / maxScroll) * maxTop : 0) + 'px';
    }

    scroller.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update);

    var dragging = false;
    var startY = 0;
    var startTop = 0;

    thumb.addEventListener('pointerdown', function(event) {
      dragging = true;
      startY = event.clientY;
      startTop = parseFloat(thumb.style.top) || 0;
      if (thumb.setPointerCapture) thumb.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    window.addEventListener('pointermove', function(event) {
      if (!dragging) return;
      var trackHeight = track.clientHeight;
      var thumbHeight = thumb.offsetHeight;
      var maxTop = Math.max(0, trackHeight - thumbHeight);
      var top = Math.max(0, Math.min(maxTop, startTop + event.clientY - startY));
      var maxScroll = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = maxTop ? (top / maxTop) * maxScroll : 0;
    });

    window.addEventListener('pointerup', function() {
      dragging = false;
    });

    track.addEventListener('pointerdown', function(event) {
      if (event.target === thumb) return;
      var rect = track.getBoundingClientRect();
      var thumbHeight = thumb.offsetHeight;
      var maxTop = Math.max(0, rect.height - thumbHeight);
      var top = Math.max(0, Math.min(maxTop, event.clientY - rect.top - thumbHeight / 2));
      var maxScroll = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = maxTop ? (top / maxTop) * maxScroll : 0;
    });

    update();
  }
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // One shared phone breakpoint for both JavaScript and CSS.
  // Portrait phones match by width; landscape phones match by their short height
  // and coarse pointer. Tablets stay in desktop/tablet mode in both orientations.
  var phoneMedia = window.matchMedia('(max-width: 600px), (max-height: 600px) and (pointer: coarse)');
  var setMode = function() {
    if (phoneMedia.matches) {
      document.body.classList.remove('desktop');
      document.body.classList.add('mobile');
    } else {
      document.body.classList.remove('mobile');
      document.body.classList.add('desktop');
      initSceneScrollBar();
    }
  };
  setMode();
  if (phoneMedia.addEventListener) phoneMedia.addEventListener('change', setMode);
  else if (phoneMedia.addListener) phoneMedia.addListener(setMode);

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // References to the inner navigation-hotspot graphics only.
  // Declared before scene creation because createLinkHotspotElement() runs there.
  var linkHotspotVisuals = [];

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Phone usability: when the compact scene drawer is open, tapping the
  // still-visible panorama closes it. The drawer and its toggle remain exempt.
  document.addEventListener('click', function(event) {
    if (!document.body.classList.contains('mobile')) return;
    if (!sceneListElement.classList.contains('enabled')) return;
    if (sceneListElement.contains(event.target)) return;
    if (sceneListToggleElement.contains(event.target)) return;
    hideSceneList();
  });

  // Scene list starts closed on every device. It opens only when the user
  // presses the scene-list button.

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  var currentScene = null;

  // Keep the initial wide view when the device changes orientation.
  // Marzipano updates the viewer size on window.resize; the next animation
  // frame reapplies the same wide FOV so portrait does not inherit the
  // narrower FOV used while the phone was in landscape.
  var WIDE_FOV = 120 * Math.PI / 180;

  function applyWideFov() {
    if (!currentScene || !currentScene.view) return;
    currentScene.view.setFov(WIDE_FOV);
  }

  var resizeFrame = null;
  window.addEventListener('resize', function() {
    if (resizeFrame !== null) {
      cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = requestAnimationFrame(function() {
      resizeFrame = null;
      applyWideFov();
      updateLinkHotspotScale();
    });
  });

  // DIAGNOSTIC BASELINE: custom hotspot scaling disabled.
  // The official demo CSS is left untouched so we can determine whether
  // the size changes come from our JS scaling or from the demo hover state.
  function updateLinkHotspotScale() {
    for (var i = 0; i < linkHotspotVisuals.length; i++) {
      linkHotspotVisuals[i].style.removeProperty('transform');
      linkHotspotVisuals[i].style.removeProperty('-webkit-transform');
      linkHotspotVisuals[i].style.removeProperty('transform-origin');
      linkHotspotVisuals[i].style.removeProperty('-webkit-transform-origin');
    }
    window.__linkHotspotScale = 1;
  }

  // Preload the first real tile level (512px) before showing a scene.
  // On iOS/WebKit also preload the complete 1024px level (24 tiles).
  // This keeps the existing pyramid and Android/desktop behaviour intact,
  // while preventing the destination scene from being exposed before iOS
  // has the next resolution level available in the browser cache.
  var isIOSWebKit = /iP(hone|od|ad)/.test(navigator.platform) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function preloadTile(url) {
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = url;
    });
  }

  function preloadFirstLevel(scene) {
    var faces = [ 'f', 'b', 'l', 'r', 'u', 'd' ];
    var id = scene.data.id;
    var loads = [];

    faces.forEach(function(face) {
      loads.push(preloadTile('tiles/' + id + '/1/' + face + '/0/0.jpg'));
    });

    if (isIOSWebKit) {
      faces.forEach(function(face) {
        for (var y = 0; y < 2; y++) {
          for (var x = 0; x < 2; x++) {
            loads.push(preloadTile('tiles/' + id + '/2/' + face + '/' + y + '/' + x + '.jpg'));
          }
        }
      });
    }

    return Promise.all(loads);
  }

  function switchScene(scene, fromScene, viaHotspot) {
    stopAutorotate();

    var viewParameters = Object.assign({}, scene.data.initialViewParameters);

    // When arriving through a navigation hotspot, orient the destination
    // camera in the walking direction. We use the destination's reverse
    // hotspot (the link that points back to the scene we came from) and
    // turn 180 degrees from it. This works in both directions.
    if (fromScene && viaHotspot && scene && scene.data && scene.data.linkHotspots) {
      var reverse = scene.data.linkHotspots.find(function(h) {
        return h.target === fromScene.data.id;
      });
      if (reverse && typeof reverse.yaw === 'number') {
        viewParameters.yaw = reverse.yaw + Math.PI;
        while (viewParameters.yaw > Math.PI) viewParameters.yaw -= 2 * Math.PI;
        while (viewParameters.yaw < -Math.PI) viewParameters.yaw += 2 * Math.PI;
      }
    }

    // TEST ONLY: start at the widest FOV allowed by the existing limiter.
    // Passing 120° lets Marzipano clamp it to the viewport-specific maximum.
    viewParameters.fov = WIDE_FOV;
    scene.view.setParameters(viewParameters);
    scene.scene.switchTo();
    window.__testFov = scene.view.fov();
    startAutorotate();
    updateSceneList(scene);
    currentScene = scene;
    updateMinimap(scene);
    updateLinkHotspotScale();
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('marzipano-demo-hotspot-wrapper');

    // Same working DOM used by Avellino v10 / the official Marzipano
    // hotspot-styles textInfo demo. No image asset is used for navigation.
    var textInfo = document.createElement('div');
    textInfo.id = 'textInfo';
    textInfo.classList.add('marzipano-link-hotspot-visual');
    linkHotspotVisuals.push(textInfo);

    var hotspotEl = document.createElement('div');
    hotspotEl.classList.add('hotspot');

    var out = document.createElement('div');
    out.classList.add('out');

    var inner = document.createElement('div');
    inner.classList.add('in');

    hotspotEl.appendChild(out);
    hotspotEl.appendChild(inner);
    textInfo.appendChild(hotspotEl);
    wrapper.appendChild(textInfo);

    // Intentionally NO pitch/scale calculation here. This keeps the original
    // 60px/40px demo geometry and does not copy Avellino v10 size changes.
    //
    // Touch devices do not all synthesize :hover the same way. Reuse the
    // demo's existing :hover rules/sonarEffect by giving the same hotspot a
    // temporary touch-active state; no new animation is created.
    wrapper.addEventListener('touchstart', function() {
      hotspotEl.classList.remove('touch-active');
      void hotspotEl.offsetWidth;
      hotspotEl.classList.add('touch-active');
      window.setTimeout(function() {
        hotspotEl.classList.remove('touch-active');
      }, 1250);
    }, { passive: true });

    wrapper.addEventListener('click', function() {
      var targetScene = findSceneById(hotspot.target);
      if (!targetScene) return;
      preloadFirstLevel(targetScene).then(function() {
        var isTouch = document.body.classList.contains('touch');
        if (isTouch) {
          // Give the existing 1.2s demo sonar animation a visible head start
          // before navigation removes the old hotspot from the DOM.
          window.setTimeout(function() {
            switchScene(targetScene, currentScene, hotspot);
          }, 350);
        } else {
          switchScene(targetScene, currentScene, hotspot);
        }
      });
    });
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Demo hotspot-styles: same DOM structure as the official tooltip demo.
    var wrapper = document.createElement('div');
    wrapper.classList.add('demo-info-hotspot');

    var out = document.createElement('div');
    out.classList.add('out');

    var inner = document.createElement('div');
    inner.classList.add('in');

    var image = document.createElement('div');
    image.classList.add('image');
    inner.appendChild(image);
    out.appendChild(inner);

    var tip = document.createElement('div');
    tip.classList.add('tip');

    var title = document.createElement('p');
    title.textContent = hotspot.title || '';
    tip.appendChild(title);

    var body = document.createElement('div');
    body.classList.add('demo-info-text');
    body.innerHTML = hotspot.text || '';
    tip.appendChild(body);

    // Keep Marzipano's positioned wrapper untouched. As with the navigation
    // hotspot, phone scaling is applied only to an inner visual layer so it
    // cannot interfere with the engine transform/anchor or the demo hover CSS.
    var visual = document.createElement('div');
    visual.classList.add('demo-info-hotspot-visual');
    visual.appendChild(out);
    visual.appendChild(tip);
    wrapper.appendChild(visual);

    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene only after its first real tile level
  // has been cached, reducing the visible preview/tile transition.
  preloadFirstLevel(scenes[0]).then(function() {
    switchScene(scenes[0]);
  });

})();
