 // invision.js
 /**
  * Project: InVision Raleigh
  * Description URL: https://www.raleighnc.gov/home/news/content/CorNews/Articles/NextCenturyCities.html
  * Date: January 2017 - May 2017
  * Project Team:  [City of Raliegh]
  *                 * James Alberque
  *                 * Reynolds McFarlane
  *                [NCSU Center for Geospatial Analytics]
  *                 * Perver Baran
  *                 * Makiko Shukunobe 
  *                 * Reza Amindarbari
  * Collaborator:  [ESRI]
  *                 * Brooks Patrick
  *                 * Richie Carmichael / Prototype Lab
  *                     x Building drag function: https://github.com/richiecarmichael/Esri-Building-Drag-Sample
  *                 * Lakshmidevi Kedharnath
  * 
  * Application: 1) Allows the user to modify the existing building dimensions (width, depth, and angle) and a number of stories.
  *              2) Allows the user to add new user defined buildings by clicking a map.
  *              3) Shows the area and volume change.
  */

require([
  'esri/Map',
  'esri/views/SceneView',
  'esri/WebScene',
  'esri/Basemap',
  'dojo/query',
  'dojo/dom',
  'dojo/on',
  'dojo/dom-style',
  'dojo/_base/lang',
  'esri/layers/GraphicsLayer',
  'esri/Graphic',
  'esri/symbols/PointSymbol3D',
  'esri/symbols/ObjectSymbol3DLayer',
  'esri/tasks/QueryTask',
  'esri/tasks/support/Query',
  'esri/geometry/Point',
  'esri/symbols/SimpleMarkerSymbol',
  'esri/views/3d/input/handlers/MouseWheelZoom',
  'esri/views/3d/input/handlers/DoubleClickZoom',
  'esri/views/3d/input/handlers/DragPan',
  'esri/views/3d/input/handlers/DragRotate',
  'esri/geometry/ScreenPoint',
  'esri/PopupTemplate',
  'esri/layers/VectorTileLayer',
  'esri/widgets/LayerList',
  'esri/widgets/Legend',
  'esri/widgets/Search',
  './third-party/Clock.js',
  'dojo/domReady!'
], function (Map, SceneView, WebScene, Basemap, query,dom, on, domStyle, lang,
        GraphicsLayer, Graphic, PointSymbol3D, ObjectSymbol3DLayer, QueryTask, Query, Point, 
        SimpleMarkerSymbol, MouseWheelZoom, DoubleClickZoom, DragPan, DragRotate, 
        ScreenPoint, PopupTemplate, VectorTileLayer, LayerList, Legend, Search, Clock
) {

    // App
    var app = {
        scale: 50000,
        center: [-78.6426888590334, 35.7777288401293],
        initialExtent: null,
        basemap: 'streets',
        viewPadding: {
            top: 50, bottom: 0
        },
        uiPadding: {
            top: 15, bottom: 15
        },
        mapView: null,
        activeView: null,
        searchWidgetNav: null
    };

  var scene3d_id;
  var scene;
  var sceneView;
  var graphicsLyr;
  var graphicsLyrSelectionSym;
  var RANDOM_BUILDINGS = 10;
  //Static variables
  var FLOOR_HEIGHT_A = 3.3; // Residential & Office (meters)
  var FLOOR_HEIGHT_B = 4.5; // Retail
  // The desired framerate. Used to ignore superfluous drag events.
  var FRAMERATE = 60;

  // Unit conversion
  var FOOT = 3.28084;
  var METER = 0.3048;
  // Max stories
  var MAX_STORIES = 40;

  var boxColor = { retail: [255, 23, 68, 0.9], office: [33, 150, 243, 0.9], residential: [255, 241, 118, 0.9] };

  //Global variables
  var lyrURL = 'http://services1.arcgis.com/aT1T0pU1ZdpuDk1t/arcgis/rest/services/Scenario_one/FeatureServer/0';
  // Keep original data
  var originalData, currentItem, trackChange, trackChangeTemp, newScenarioData;
  var originalDataVol = { total: 0, area: 0, retail: 0, office: 0, residential: 0 };
  var newScenarioDataVol = { total: 0, area: 0, retail: 0, office: 0, residential: 0 };
  var attributesTemplate = {
    fid: null,
    pinNumber: null,
    zoning: null,
    parcelId: null,
    width: null,
    depth: null,
    angle: null,
    residentialStory: null,
    residentialStoryHeight: null,
    retailStory: null,
    retailStoryHeight: null,
    officeStory: null,
    officeStoryHeight: null
  };
  var _last = Date.now();

    // Scene
    scene3d_id = '925cf9f4dde142a3a776e00aabb38e0b';
    scene = new WebScene({
      portalItem: { // autocasts as new PortalItem()
        id: scene3d_id
      }
    });


    sceneView = new SceneView({
      container: 'viewDiv',
      map: scene,
      padding: app.viewPadding,
      ui: {
        padding: app.uiPadding
      }
    });

    function planningView(){
      sceneView.camera.position = [-78.65, 35.7, 800];
      sceneView.camera.tilt = 85;
      sceneView.zoom = 15;
    }

    // World Planning 3D Basemap to be visible
    sceneView.then(function(result) {
      toggleLayer(true, 'World Planning 3D Basemap');
      createSearchWidget("searchNavDiv");
    });
    
    //remove splash screen after 5 seconds
    setTimeout(function () {
      let splashNode = dom.byId('splash');
      domStyle.set(splashNode, 'display', 'none');
      let planningNode = dom.byId('planning');
      domStyle.set(planningNode, 'display', 'block');
      planningView();
    }, 5000);


    window.zoomToLocation = function () {
        // Load All
        sceneView.goTo({
            center: [-78.64091812878752, 35.7771204390763],
            heading: 10, // set the heading to point South
            zoom: 18,
            tilt: 75
        });
        let panelnode = dom.byId('planning');
        domStyle.set(panelnode, 'display', 'none');
        let areaPlanOne = dom.byId('area-plan');
        domStyle.set(areaPlanOne, 'display', 'block');
        toggleLayer(true, 'Raleigh Textured Building Models - Raleigh');
        resetVariables();
    }


    ////////////////////////////////////////////////////
    //////////////////// Cast Shadow ///////////////////
    ////////////////////////////////////////////////////
    let shadowBtn = dom.byId('shadow');
    let clock = new Clock({
        el: 'clock',
        skin: require.toUrl('./third-party/clock.svg'),
        time: sceneView.environment.lighting.date.getTime()
    });

    sceneView.environment.lighting.directShadowsEnabled = true;

    let listener = clock.on("time-change", function (time) {
      sceneView.environment.lighting.date = time;
    });

    sceneView.ui.add('clock', 'bottom-left');
    clock.el.style.visibility = 'hidden';

    shadowBtn.addEventListener('click', function(e){
        if (clock.el.style.visibility === 'visible'){
          clock.el.style.visibility = 'hidden';
          sceneView.environment.lighting.directShadowsEnabled = false;
        } else {
          clock.el.style.visibility = 'visible';
          sceneView.environment.lighting.directShadowsEnabled = true;
          clock.mode = 'live'; // Show clock on 'live' mode
        }
    });
//----> [Cast Shadow]

    // add Graphics
    function graphicMakerAdder(typeAttrs, symbol, z, geom) {
      var graphicObj = new Graphic({
        attributes: typeAttrs,
        geometry: new Point({
          x: geom.x,
          y: geom.y,
          z: z,
          spatialReference: { wkid: 102100 }
        }),
        symbol: symbol
      });
      graphicsLyr.add(graphicObj);
    }


    function symbologyMaker(items, height, color) {
      var objectSymbol = new PointSymbol3D({
        symbolLayers: [new ObjectSymbol3DLayer({
          width: items.width,
          depth: items.depth,
          height: height,
          heading: items.angle,
          anchor: "bottom",
          resource: {
            primitive: "cube"
          },
          material: {
            color: color
          }
        })]
      });
      return objectSymbol;
    }

    function setAttributes(feature) {
      var attrs = {
        fid: null,
        pinNumber: null,
        zoning: null,
        parcelId: null,
        width: null,
        depth: null,
        angle: null,
        residentialStory: null,
        residentialStoryHeight: null,
        retailStory: null,
        retailStoryHeight: null,
        officeStory: null,
        officeStoryHeight: null,
      };
      // var attrs = $.extend(true, {}, attributes);
      attrs.fid = feature.attributes.FID;
      attrs.pinNumber = feature.attributes.PIN_NUM;
      attrs.zoning = feature.attributes.ZONING;
      attrs.parcelId = feature.attributes.Parcel_FID;
      attrs.width = Math.round(feature.attributes.Dim1);
      attrs.depth = Math.round(feature.attributes.Dim2);
      attrs.angle = Math.round(feature.attributes.Angle);
      attrs.residentialStory = feature.attributes.Residen;
      attrs.residentialStoryHeight = feature.attributes.Residen * FLOOR_HEIGHT_A;
      attrs.officeStory = feature.attributes.Office;
      attrs.officeStoryHeight = feature.attributes.Office * FLOOR_HEIGHT_A;
      attrs.retailStory = feature.attributes.Retail;
      attrs.retailStoryHeight = feature.attributes.Retail * FLOOR_HEIGHT_B;
      // console.log(attrs);
      return attrs;
    }


    function randomBuildingSelection(min, max, iternum) {
      // console.log(min, max, iternum);
      var selectedNum = [];
      for (var i = 0; i < iternum; i++) {
        var random = Math.floor(Math.random() * (max - min + 1)) + min;
        selectedNum.push(random);
      }
      return selectedNum;
    }

    function toggleLayer(flag, name) {
      sceneView.then(function () {
        var testLyrs = sceneView.map.layers.items;
        testLyrs.forEach(function (item) {
          if (item.title == name) {
            item.visible = flag;
          }
        });
      });
    }

    function resetVariables() {
      originalData = [];
      trackChange = [];
      trackChangeTemp = [];
      newScenarioData = [];
      currentItem = { fid: null, attributes: null, geometry: null };
      if (sceneView.map.findLayerById('buildings')){
         sceneView.map.findLayerById('buildings').removeAll();
      }
      if (sceneView.map.findLayerById('selection')){
        sceneView.map.findLayerById('selection').removeAll();
      }
      //initialHtmlElems();
    }

    function setGraphicsLayers(){
      graphicsLyr = new GraphicsLayer({
        id: 'buildings',
        elevationInfo: { mode: 'relative-to-ground' },
        visible: false, 
        title: 'Explorer Scenario',
        listMode: 'show'
      });
      sceneView.map.add(graphicsLyr);

      graphicsLyrSelectionSym = new GraphicsLayer({
        id: 'selection',
        elevationInfo: { mode: 'relative-to-ground' },
        visible: false,
        title: 'Selection',
        listMode: 'hide'
      });
      sceneView.map.add(graphicsLyrSelectionSym);
    }


    function loadInitialGraphics() {
      setGraphicsLayers();
      resetVariables();
      initialHtmlElems();
      // Track change of data
      var queryTask = new QueryTask({ url: lyrURL });
      var query = new Query();
      query.where = 'FID > -1';
      query.outFields = ['*'];
      query.returnGeometry = true;
      var selection;

      queryTask.execute(query).then(function (results) {
        //console.log(results);
        selection = randomBuildingSelection(0, results.features.length - 1, RANDOM_BUILDINGS);
        //selection = [37, 44, 5, 7, 8]; //Testing a slider bug
        for (var i = 0; i < selection.length; i++) {
          var idx = selection[i];
          var feature = results.features[idx];
          var coor = feature.geometry;
          var attrs = setAttributes(feature);
          var featureClone = results.features[idx].clone();
          var cloneAttrs = setAttributes(featureClone);
          var cloneCoor = featureClone.geometry;
          var data = { fid: cloneAttrs.fid, attributes: cloneAttrs, geometry: cloneCoor };
          var curReport = calculateVolume(data);
          data.report = curReport;
          originalData.push(data);
          var cloneCurReport = $.extend(true, {}, curReport);
          var newReport = { fid: data.fid, report: cloneCurReport };
          newScenarioData.push(newReport);
          totalVolumeReport(originalDataVol, curReport);

          if (attrs.retailStory > 0) {
            createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
          }
          if (attrs.officeStory > 0) {
            createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
          }
          if (attrs.residentialStory > 0) {
            var bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
            createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
          }
        } // end for
      });// end queryTask
      //console.log(newScenarioData);
    }

    ////////////////////////////////////////////////////
    //////////////// Total Volume Report ///////////////
    ////////////////////////////////////////////////////
    /**
     * Calculate volume for report
     * @param {Object} data 
     */
    function calculateVolume(data) {
      var reportVolme = {
        area: null,
        volume: null,
        retailVol: null,
        officeVol: null,
        residenVol: null
      };
      var attrs = data.attributes;
      var storyTotal = (attrs.retailStoryHeight + attrs.officeStoryHeight + attrs.residentialStoryHeight) * FOOT;
      var area = Math.round(attrs.width * FOOT) * Math.round(attrs.depth * FOOT);
      reportVolme.area = Math.round(area).toLocaleString();
      reportVolme.volume = (Math.round(area * storyTotal)).toLocaleString();
      reportVolme.retailVol = (Math.round((attrs.retailStoryHeight * FOOT) * area)).toLocaleString();
      reportVolme.officeVol = (Math.round((attrs.officeStoryHeight * FOOT) * area)).toLocaleString();
      reportVolme.residenVol = (Math.round((attrs.residentialStoryHeight * FOOT) * area)).toLocaleString();
      return reportVolme;
    }

    /**
     * Create total volume data
     * @param {Object} volData - e.g. originalDataVol or newScenarioDataVol
     * @param {Object} repo - report object for a graphic
     */
    function totalVolumeReport(volData, repo) {
      volData.total += Number(repo.volume.split(',').join(''));
      volData.area += Number(repo.area.split(',').join(''));
      volData.retail += Number(repo.retailVol.split(',').join(''));
      volData.office += Number(repo.officeVol.split(',').join(''));
      volData.residential += Number(repo.residenVol.split(',').join(''));
    }

    /**
     * Create total volume data for the new scenario
     * Call: $('#report-all').on('click'...
     */
    function newScenarioVolumeReport() {
      newScenarioDataVol = { total: 0, area: 0, retail: 0, office: 0, residential: 0 };
      for (var i = 0; i < newScenarioData.length; i++) {
        var repo = newScenarioData[i].report;
        if (repo) {
          totalVolumeReport(newScenarioDataVol, repo);
        }
      }
    }

    /**
     * Create PieChart for total volume report
     * @param {Object} data - total volume data
     * @param {String} htmlEle  - html div element for the chart
     * @param {String} chartName - title name for the chart
     */
    function pieChart(data, htmlEle, chartName) {
      if (data.total !== 0) {
        var retailP = ((data.retail / data.total) * 100).toFixed(1);
        var officeP = ((data.office / data.total) * 100).toFixed(1);
        var residenP = ((data.residential / data.total) * 100).toFixed(1);
        //console.log(retailP, officeP, residenP);
        var chart = c3.generate({
          bindto: htmlEle,
          data: {
            columns: [
              ['Retail', retailP],
              ['Office', officeP],
              ['Residential', residenP]
            ],
            type: 'donut',
            colors: {
              Retail: '#FF6384',
              Office: '#36A2EB',
              Residential: '#FFCE56'
            }
          },
          donut: { title: chartName }
        });
      }
    }
    //----> [Total Volume Report]

    function graphicLyrFilterById() {
      var buildingsGraphicsLyr = sceneView.map.findLayerById('buildings');
      return buildingsGraphicsLyr.graphics.filter(function (graphic) {
        return graphic.attributes.fid === currentItem.fid;
      });
    }


    function setCloneThenRemove(item) {
      var newGraphic = item.clone();
      sceneView.map.findLayerById('buildings').remove(item);
      return newGraphic;
    }


    // Called on the drag update to refresh the location of a dragged building (i.e. floors).
    function updateSelection() {
      var selectedGraphics = graphicLyrFilterById();
      if (currentItem.fid === _drag.fid) {
        selectedGraphics.forEach(function (item) {
          var newGraphic = setCloneThenRemove(item);
          newGraphic.geometry.x = currentItem.geometry.x + _drag.dx;
          newGraphic.geometry.y = currentItem.geometry.y + _drag.dy;
          newGraphic.symbol.symbolLayers.items[0].heading = currentItem.attributes.angle;
          newGraphic.symbol.symbolLayers.items[0].material.color = [0, 255, 255, 0.7];
          graphicsLyr.add(newGraphic);
        });
      }
    }


    // Updating Dimentions for graphics
    function updateDimentions(value, dimention) {
      if (currentItem) {
        var filtered = graphicLyrFilterById();
        filtered.forEach(function (item) {
          var newGraphic = setCloneThenRemove(item);
          switch (dimention) {
            case 'width':
              currentItem.attributes.width = value;
              newGraphic.symbol.symbolLayers.items[0].width = value;
              break;

            case 'depth':
              currentItem.attributes.depth = value;
              newGraphic.symbol.symbolLayers.items[0].depth = value;
              break;

            case 'heading':
              currentItem.attributes.angle = value;
              newGraphic.symbol.symbolLayers.items[0].heading = value;
              break;
          }
          graphicsLyr.add(newGraphic);
        });
      }
    }


    function createGraphicStories(numStories, attributes, floorHeight, geometry, bottomZ, symColor) {
      for (var q = 0; q < numStories; q++) {
        var SymbolRetial = symbologyMaker(attributes, floorHeight, symColor);
        var z = bottomZ + (q * floorHeight);
        graphicMakerAdder(attributes, SymbolRetial, z, geometry);
      }
    }


    function onStoriesSliderChange(value, spaceType) {
      var filtered = graphicLyrFilterById();
      graphicsLyr.removeMany(filtered);
      var attrs, coor, bottomZ;

      switch (spaceType) {
        case 'retail':
          currentItem.attributes.retailStory = value;
          currentItem.attributes.retailStoryHeight = value * FLOOR_HEIGHT_B;
          attrs = currentItem.attributes;
          coor = currentItem.geometry;
          bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
          if (value > 0) {
            createGraphicStories(value, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
          }
          if (attrs.officeStory > 0) {
            createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
          }
          if (attrs.residentialStory > 0) {
            createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
          }
          break;

        case 'office':
          currentItem.attributes.officeStory = value;
          currentItem.attributes.officeStoryHeight = value * FLOOR_HEIGHT_A;
          attrs = currentItem.attributes;
          coor = currentItem.geometry;
          bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
          if (attrs.retailStory > 0) {
            createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
          }
          if (value > 0) {
            createGraphicStories(value, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
          }
          if (attrs.residentialStory > 0) {

            createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
          }
          break;

        case 'residential':
          currentItem.attributes.residentialStory = value;
          currentItem.attributes.residentialStoryHeight = value * FLOOR_HEIGHT_A;
          attrs = currentItem.attributes;
          coor = currentItem.geometry;
          bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
          if (attrs.retailStory > 0) {
            createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
          }
          if (attrs.officeStory > 0) {
            createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
          }
          if (value > 0) {
            createGraphicStories(value, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
          }
          break;
      }
      //console.log(currentItem);
      var totalH = attrs.retailStoryHeight + attrs.officeStoryHeight + attrs.residentialStoryHeight;
      identifySelection(coor.x, coor.y, totalH, attrs);
    }

    function compareFidObject(fid) {
      var original = getOriginalDataByFid(fid);
      if (original) {
        var oattrs = original.attributes;
        var cattrs = currentItem.attributes;
        var ogeom = original.geometry;
        var cgeom = currentItem.geometry;
        // Compare object
        if (oattrs.width != cattrs.width ||
          oattrs.depth != cattrs.depth ||
          oattrs.retailStory != cattrs.retailStory ||
          oattrs.officeStory != cattrs.officeStory ||
          oattrs.residentialStory != cattrs.residentialStory ||
          oattrs.angle != cattrs.angle ||
          ogeom.x != cgeom.x || ogeom.y != cgeom.y) {
          return true;
        } else {
          return false;
        }
      } else {
        return 'NO_ORIGINAL_DATA';
      }
    }


    function getOriginalDataByFid(fid) {
      for (var i = 0; i < originalData.length; i++) {
        if (originalData[i].fid === fid) {
          return originalData[i];
        }
      }
    }

    function distinctVal(array) {
      var newArray = [];
      for (var i = 0; i < array.length; i++) {
        if (newArray.indexOf(array[i]) == -1) {
          newArray.push(array[i]);
        }
      }
      return newArray;
    }

    function refreshCurrent() {
      var filtered = graphicLyrFilterById();
      graphicsLyrSelectionSym.removeAll();
      graphicsLyr.removeMany(filtered);
      var fidData = getOriginalDataByFid(currentItem.fid);
      var attrs, coor;
      if (fidData) {
        attrs = fidData.attributes;
        coor = fidData.geometry;

        if (attrs.retailStory > 0) {
          createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
        }
        if (attrs.officeStory > 0) {
          createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
        }
        if (attrs.residentialStory > 0) {
          var bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
          createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
        }
        currentItem = $.extend(true, {}, fidData);
      } else {
        currentItem = { fid: null, attributes: null, geometry: null };
      }
      // trackChange = $.grep(trackChange, function(val){
      //     return val != currentItem.fid;
      // })
      // console.log(trackChange);
      // console.log(trackChange.indexOf(currentItem.fid));
      trackChange.splice(trackChange.indexOf(currentItem.fid), 1);
      //console.log(trackChange);
      updateHtmlElems(attrs);
      originalReport();
      updateNewScenarioReport();
    }

    function identifySelection(x, y, z, attributes) {
      attributes = attributes || null;
      console.log();
      if (graphicsLyrSelectionSym.graphics){
        graphicsLyrSelectionSym.removeAll();
      }
      //var coor = currentItem.geometry;
      var point = new Point({
        x: x,
        y: y,
        z: z + 20,
        spatialReference: { wkid: 102100 }
      });

      var markerSymbol = new SimpleMarkerSymbol({
        color: [226, 119, 40],

        outline: { // autocasts as new SimpleLineSymbol()
          color: [255, 255, 255],
          width: 2
        }
      });

      var pointGraphic = new Graphic({
        geometry: point,
        symbol: markerSymbol
      });

      if (attributes) {
        pointGraphic.popupTemplate = {
          title: 'FID: ' + attributes.fid.toString(),
          content: '<p><br>PIN Number: ' + attributes.pinNumber +
          '<br>Zoning: ' + attributes.zoning + '</p>'
        };
      }
      graphicsLyrSelectionSym.add(pointGraphic);
    }  


    function updateChangeReport(numStrOne, numStrTwo) {
      if (numStrOne && numStrTwo) {
        var numOne, numTwo, diff;
        if (typeof numStrOne != 'number') {
          numOne = numStrOne.split(',').join('');
        } else {
          numOne = numStrOne;
        }
        if (typeof numStrTwo != 'number') {
          numTwo = numStrTwo.split(',').join('');
        } else {
          numTwo = numStrTwo;
        }
        diff = Number(numTwo) - Number(numOne);
        if (diff > 0) {
          return '+' + diff.toLocaleString();
        } else {
          return diff.toLocaleString();
        }
      }
    }


    function updateNewScenarioReport() {
      if (currentItem.attributes) {
        // Track change
        if (compareFidObject(currentItem.fid)) {
          trackChangeTemp.push(currentItem.fid);
          trackChange = distinctVal(trackChangeTemp);
        }
        var newReport = calculateVolume(currentItem);
        for (var i = 0; i < newScenarioData.length; i++) {
          if (newScenarioData[i].fid == currentItem.fid) {
            newScenarioData[i].report = newReport;
          }
        }

        //Report - new
        $('.new-retail-vol').text(newReport.retailVol);
        $('.new-office-vol').text(newReport.officeVol);
        $('.new-residen-vol').text(newReport.residenVol);
        $('.new-area').text(newReport.area);
        $('.new-vol').text(newReport.volume);

        var original = getOriginalDataByFid(currentItem.fid);
        if (original) {
          $('.diff-retail-vol').text(updateChangeReport(original.report.retailVol, newReport.retailVol));
          $('.diff-office-vol').text(updateChangeReport(original.report.officeVol, newReport.officeVol));
          $('.diff-residen-vol').text(updateChangeReport(original.report.residenVol, newReport.residenVol));
          $('.diff-area').text(updateChangeReport(original.report.area, newReport.area));
          $('.diff-vol').text(updateChangeReport(original.report.volume, newReport.volume));
        } else {
          $('.diff-retail-vol').text(updateChangeReport('0', newReport.retailVol));
          $('.diff-office-vol').text(updateChangeReport('0', newReport.officeVol));
          $('.diff-residen-vol').text(updateChangeReport('0', newReport.residenVol));
          $('.diff-area').text(updateChangeReport('0', newReport.area));
          $('.diff-vol').text(updateChangeReport('0', newReport.volume));
        }
      }
    }

    
    function updateTotalVolumeReport() {
      if (originalDataVol.total !== 0) {
        $('.t-cur-retail-vol').text(originalDataVol.retail.toLocaleString());
        $('.t-cur-office-vol').text(originalDataVol.office.toLocaleString());
        $('.t-cur-residen-vol').text(originalDataVol.residential.toLocaleString());
        $('.t-cur-area').text(originalDataVol.area.toLocaleString());
        $('.t-cur-vol').text(originalDataVol.total.toLocaleString());
      }
      if (newScenarioDataVol.total !== 0) {
        $('.t-new-retail-vol').text(newScenarioDataVol.retail.toLocaleString());
        $('.t-new-office-vol').text(newScenarioDataVol.office.toLocaleString());
        $('.t-new-residen-vol').text(newScenarioDataVol.residential.toLocaleString());
        $('.t-new-area').text(newScenarioDataVol.area.toLocaleString());
        $('.t-new-vol').text(newScenarioDataVol.total.toLocaleString());
      }
      $('.t-diff-retail-vol').text(updateChangeReport(originalDataVol.retail, newScenarioDataVol.retail));
      $('.t-diff-office-vol').text(updateChangeReport(originalDataVol.office, newScenarioDataVol.office));
      $('.t-diff-residen-vol').text(updateChangeReport(originalDataVol.residential, newScenarioDataVol.residential));
      $('.t-diff-area').text(updateChangeReport(originalDataVol.area, newScenarioDataVol.area));
      $('.t-diff-vol').text(updateChangeReport(originalDataVol.total, newScenarioDataVol.total));
    }


    function originalReport() {
      // Report - current
      var original = getOriginalDataByFid(currentItem.fid);
      if (original) {
        $('.cur-retail-vol').text(original.report.retailVol);
        $('.cur-office-vol').text(original.report.officeVol);
        $('.cur-residen-vol').text(original.report.residenVol);
        $('.cur-area').text(original.report.area);
        $('.cur-vol').text(original.report.volume);
      } else {
        $('.cur-retail-vol').text(0);
        $('.cur-office-vol').text(0);
        $('.cur-residen-vol').text(0);
        $('.cur-area').text(0);
        $('.cur-vol').text(0);
      }
    }


    function initialHtmlElems() {
      $('.currentItem').text('');
      $('#boxWidthText').val(0);
      $('#boxDepthText').val(0);
      $('#boxAngleText').val(0);
      $('#boxWidthSlider').slider('setValue', 0, true);
      $('#boxDepthSlider').slider('setValue', 0, true);
      $('#boxAngleSlider').slider('setValue', 0, true);
      // Stories slider
      $('#retailValText').val(0);
      $('#officeValText').val(0);
      $('#residenValText').val(0);
      $('#typeRetail').slider('setValue', 0, true);
      $('#typeOffice').slider('setValue', 0, true);
      $('#typeResiden').slider('setValue', 0, true);
      //Report -current
      $('.cur-retail-vol').text(0);
      $('.cur-office-vol').text(0);
      $('.cur-residen-vol').text(0);
      $('.cur-area').text(0);
      $('.cur-vol').text(0);
      //Report - new
      $('.new-retail-vol').text(0);
      $('.new-office-vol').text(0);
      $('.new-residen-vol').text(0);
      $('.new-area').text(0);
      $('.new-vol').text(0);
    }


    function updateHtmlElems(attrs) {
      if (currentItem.fid) {
        $('.currentItem').text(currentItem.fid);
        // Dimention slider
        $('#boxWidthText').val(attrs.width * FOOT);
        $('#boxDepthText').val(attrs.depth * FOOT);
        $('#boxAngleText').val(attrs.angle);
        $('#boxWidthSlider').slider('setValue', attrs.width * FOOT, true);
        $('#boxDepthSlider').slider('setValue', attrs.depth * FOOT, true);
        $('#boxAngleSlider').slider('setValue', attrs.angle, true);
        // Stories slider
        $('#retailValText').val(attrs.retailStory);
        $('#officeValText').val(attrs.officeStory);
        $('#residenValText').val(attrs.residentialStory);
        // Set slider max value to MAX_STORIES
        $('#typeRetail').slider('setAttribute', 'max', MAX_STORIES);
        $('#typeOffice').slider('setAttribute', 'max', MAX_STORIES);
        $('#typeResiden').slider('setAttribute', 'max', MAX_STORIES);
        $('#typeRetail').slider('setValue', attrs.retailStory, true);
        $('#typeOffice').slider('setValue', attrs.officeStory, true);
        $('#typeResiden').slider('setValue', attrs.residentialStory, true);
      }
      else {
        initialHtmlElems();
      }
    }

    function updateAboutBuilding(){
        var original = getOriginalDataByFid(currentItem.fid);
        if (original){
          var attrs = original.attributes;
          $('#no-original-txt').css('display', 'none');
          $('.about-fid').text(attrs.fid);
          $('.about-zoning').text(attrs.zoning);
          $('.about-pinNum').text(attrs.pinNumber);
          $('.about-parcelId').text(attrs.parcelId);
          $('.about-retail').text(attrs.retailStory);
          $('.about-office').text(attrs.officeStory);
          $('.about-residential').text(attrs.residentialStory);
          $('.about-width').text(attrs.width * FOOT);
          $('.about-depth').text(attrs.depth * FOOT); 
          $('.about-angle').text(attrs.angle);
        }
      else {
        $('#no-original-txt').css('display', 'block');
        $('.about-fid').text(currentItem.fid);
        $('.about-zoning').text('');
        $('.about-pinNum').text('');
        $('.about-parcelId').text('');
        $('.about-retail').text('');
        $('.about-office').text('');
        $('.about-residential').text('');
        $('.about-width').text('');
        $('.about-depth').text(''); 
        $('.about-angle').text('');
      }
    }

    function getAttributesFromGraphic(graphic) {
      var attrs = (JSON.parse(JSON.stringify(attributesTemplate)));
      attrs.fid = graphic.attributes.fid;
      attrs.pinNumber = graphic.attributes.pinNumber;
      attrs.parcelId = graphic.attributes.parcelId;
      attrs.zoning = graphic.attributes.zoning;
      attrs.width = graphic.symbol.symbolLayers.items[0].width;
      attrs.depth = graphic.symbol.symbolLayers.items[0].depth;
      attrs.angle = graphic.symbol.symbolLayers.items[0].heading;
      attrs.residentialStory = graphic.attributes.residentialStory;
      attrs.residentialStoryHeight = graphic.attributes.residentialStory * FLOOR_HEIGHT_A;
      attrs.officeStory = graphic.attributes.officeStory;
      attrs.officeStoryHeight = graphic.attributes.officeStory * FLOOR_HEIGHT_A;
      attrs.retailStory = graphic.attributes.retailStory;
      attrs.retailStoryHeight = graphic.attributes.retailStoryHeight * FLOOR_HEIGHT_B;
      return attrs;
    }


    //////////////////////////////////////////////////////////
    ///////////////////// LayerLists /////////////////////////
    //////////////////////////////////////////////////////////
    var lyrList = new LayerList({
      container: 'layerList',
      view: sceneView,
    });

    var exploreLyrList = new LayerList({
      container: 'explorer-layerList',
      view: sceneView,
    });

    //////////////////////////////////////////////////////////
    /////////////////////// Legend ///////////////////////////
    //////////////////////////////////////////////////////////
    var legend = new Legend({
      container: 'legend',
      view: sceneView
    });

    var explorerLegend = new Legend({
      container: 'explorer-legend',
      view: sceneView
    });

    //////////////////////////////////////////////////////////
    /////////////////////// Search ///////////////////////////
    //////////////////////////////////////////////////////////

    function createSearchWidget(parentId) {
      var search = new Search({
        viewModel: {
          view: app.activeView,
          highlightEnabled: false,
          popupEnabled: true,
          showPopupOnSelect: true
        }
      }, parentId);
      search.startup();
      return search;
    }
    

    ////////////////////////////////////////////////////////////
    //////////////////////// Events ///////////////////////////
    ///////////////////////////////////////////////////////////

    //********************
    // Double click event
    //********************
      var _ondoubleclick = function(evt){
        var s = new ScreenPoint({
          x: evt.x,
          y: evt.y
        });
      sceneView.hitTest(s).then(function (picked) {
        evt.stopPropagation();
      // sceneView.hitTest(evt.screenPoint).then(function (picked) {
        if (picked.results[0].graphic) {
          var pickedItem = picked.results[0].graphic;
          //console.log('picked', picked);
          graphicsLyrSelectionSym.visible = true;
           $('#new-building-popup').popup('hide');
          var cloneAttrs = getAttributesFromGraphic(pickedItem);
          currentItem.fid = pickedItem.attributes.fid;
          currentItem.attributes = cloneAttrs;
          currentItem.geometry = pickedItem.geometry;
          updateAboutBuilding();
          var geom = currentItem.geometry;
          var totalH = cloneAttrs.retailStoryHeight + cloneAttrs.officeStoryHeight + cloneAttrs.residentialStoryHeight;
          identifySelection(geom.x, geom.y, totalH, cloneAttrs);
          updateHtmlElems(cloneAttrs);
          originalReport();
          updateNewScenarioReport();
        }
        else {
          identifySelection(evt.mapPoint.x, evt.mapPoint.y, 0);
          currentItem.geometry = { x: evt.mapPoint.x, y: evt.mapPoint.y, z: 0 };
          if ($('#panelExplorer').hasClass('in') && $('#collapseExplorer').hasClass('in')){
            $('#new-building-popup').popup('show');
          }
        }
      });
    };

    //********************
    // Drag event
    //********************
    var _drag = null;
    var _data = [];
    // Define function to be called by the sceneview drag event.
    var _ondrag = function (e) {
      switch (e.action) {
        case "start":
          //console.log('start');
          var s = new ScreenPoint({
            x: e.x,
            y: e.y
          });
          sceneView.hitTest(s).then(function (p) {
            // Find the picked buidling floor. Exit if nothing found.
            if (!p || !p.results || p.results.length === 0) { return; }
            var graphic = p.results[0].graphic;
            //console.log('graphic: ', graphic, 'currentItem: ', currentItem);
            if (!graphic) { return; }
            if (!graphic.geometry) { return; }

            if (currentItem.fid != graphic.attributes.fid) {
              currentItem.fid = graphic.attributes.fid;
              currentItem.attributes = graphic.attributes;
              currentItem.geometry = graphic.geometry;
            }

            _drag = {
              fid: graphic.attributes.fid,
              dx: 0,
              dy: 0
            };

            // Disable sceneview navigation.
            if (sceneView.inputManager.viewEvents.inputManager.hasHandlers("navigation")) {
              sceneView.inputManager.viewEvents.inputManager.uninstallHandlers("navigation");
            }

            updateSelection();
            updateHtmlElems(currentItem.attributes);
            originalReport();
            updateNewScenarioReport();
          }); // END hitTest
          break;
        case "update":
          //console.log('update');
          // Ignore this drag event if desired framerate already achieved.
          if (!_drag) { return; }
          var now = Date.now();
          if (now - _last < 1000 / FRAMERATE) { return; }
          _last = now;

          // // Use internal method to convert mouse drag origin and current mouse location
          // // to map coordinates. Store map distance delta.
          var h = e.native.target.height;
          var s1 = sceneView._stage.pick([e.origin.x, h - e.origin.y], [], false);
          var s2 = sceneView._stage.pick([e.x, h - e.y], [], false);
          var r1 = sceneView._computeMapPointFromIntersectionResult.call(sceneView, s1.minResult);
          var r2 = sceneView._computeMapPointFromIntersectionResult.call(sceneView, s2.minResult);
          if (!r1 || !r2) { return; }
          _drag.dx = r2.x - r1.x;
          _drag.dy = r2.y - r1.y;

          // // Update selected building floors. This will apply the deltas created above.
          updateSelection();
          break;
        case "end":
          //console.log('end');
          if (!_drag) { return; }

          var selectedGraphics = graphicLyrFilterById();
          var attrs, coor, totalH;
          sceneView.map.findLayerById('buildings').removeMany(selectedGraphics);
          if (currentItem.fid === _drag.fid) {
            attrs = currentItem.attributes;
            coor = currentItem.geometry;
            coor.x += _drag.dx;
            coor.y += _drag.dy;
            if (attrs.retailStory > 0) {
              createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
            }
            if (attrs.officeStory > 0) {
              createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
            }
            if (attrs.residentialStory > 0) {
              var bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
              createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
            }

          }
          totalH = attrs.retailStoryHeight + attrs.officeStoryHeight + attrs.residentialStoryHeight;
          identifySelection(coor.x, coor.y, totalH, attrs);
          _drag = null;

          // // Restore sceneview interaction to default mouse/pointer behaviour.
          sceneView.inputManager.viewEvents.inputManager.installHandlers("navigation", [
            new MouseWheelZoom.MouseWheelZoom(sceneView),
            new DoubleClickZoom.DoubleClickZoom(sceneView),
            new DragPan.DragPan(sceneView, "primary"),
            new DragRotate.DragRotate(sceneView, "secondary")
          ]);

          // // Reassociate this drag function with the sceneview drag event.
          sceneView.on("drag", _ondrag);
          sceneView.on("double-click", _ondoubleclick);
          break;
      } // END switch
    };

    // Define function to call when the drag event is fired.
    sceneView.on("drag", _ondrag);
    sceneView.on("double-click", _ondoubleclick);

    //********************
    // jQuery events
    //********************
    $(function () {
      //setSearchWidgets();
      $('#new-building-popup').popup({
        backgroundactive: true,
      });
      $('#new-building-popup').popup('hide');
      $('#report-popup').popup();

      $('#boxWidthSlider').slider();
      $('#boxDepthSlider').slider();
      $('#boxAngleSlider').slider();

      $('#typeRetail').slider();
      $('#typeOffice').slider();
      $('#typeResiden').slider();
      $('#areaInfo-accordion').show();
    }); //jQuery function


    function toggle_visibility(id) {
      var display = $(id).css('display');
      if (display == 'block') {
        $(id).css('display', 'none');
      } else {
        $(id).css('display', 'block');
      }
    }


    $('#home').on('click', function () {
      planningView();
      toggle_visibility('#planning');
      toggle_visibility('#area-plan');
      resetVariables();
      //graphicsLyr.visible = false;
      $('#panelExplorer').collapse('hide');
      $('#collapseExplorer').collapse('hide');
      $('#panelLayerList').collapse('hide');
      $('#collapseLayerList').collapse('hide');
      $('#panelBasemaps').collapse('hide');
      $('#collapseBasemaps').collapse('hide');
      $('#panelHelp').collapse('hide');
      $('#collapseHelp').collapse('hide');
      if ((clock.el.style.visibility === 'visible')){
        clock.el.style.visibility = 'hidden';
        sceneView.environment.lighting.directShadowsEnabled = false;
      }
    });

    // Slider - Dimentions
    $('#boxWidthSlider').slider().on('slide', function (evt) {
      var widthVal = $('#boxWidthSlider').data('slider').getValue();
      var widthValM = widthVal * METER;
      updateDimentions(widthValM, 'width'); // Update graphics
      $('#boxWidthText').val(widthVal);
      updateNewScenarioReport();
    });
    $('#boxDepthSlider').slider().on('slide', function (evt) {
      var depthVal = $('#boxDepthSlider').data('slider').getValue();
      updateDimentions(depthVal * METER, 'depth');
      $('#boxDepthText').val(depthVal);
      updateNewScenarioReport();
    });
    $('#boxAngleSlider').slider().on('slide', function (evt) {
      var angleVal = $('#boxAngleSlider').data('slider').getValue();
      updateDimentions(angleVal, 'heading');
      $('#boxAngleText').val(angleVal);
      updateNewScenarioReport();
    });

    // Slider - Number of Stories
    $('#typeRetail').slider().on('slide', function (evt) {
      var retailVal = $('#typeRetail').data('slider').getValue();
      var otherVals = Number($('#officeValText').val()) + Number($('#residenValText').val());
      var available = MAX_STORIES - otherVals;
      $('#typeRetail').slider('setAttribute', 'max', available);
      $('#typeOffice').slider('setAttribute', 'max', Number($('#officeValText').val()));
      $('#typeResiden').slider('setAttribute', 'max', Number($('#residenValText').val()));
      $('#typeRetail').slider();
      if (currentItem.fid) {
        onStoriesSliderChange(retailVal, 'retail');
      }
      // Update text area and report
      $('#retailValText').val(retailVal);
      updateNewScenarioReport();
    });

            
    $('#typeOffice').slider().on('slide', function (evt) {
      var officeVal = $('#typeOffice').data('slider').getValue();
      var otherVals = Number($('#retailValText').val()) + Number($('#residenValText').val());
      var available = MAX_STORIES - otherVals;
      $('#typeOffice').slider('setAttribute', 'max', available);
      $('#typeRetail').slider('setAttribute', 'max', Number($('#retailValText').val()));
      $('#typeResiden').slider('setAttribute', 'max', Number($('#residenValText').val()));

      if (currentItem.fid) {
        onStoriesSliderChange(officeVal, 'office');
      }
      // Update text area and report
      $('#officeValText').val(officeVal);
      updateNewScenarioReport();
    });


    $('#typeResiden').slider().on('slide', function (evt) {
      var residenVal = $('#typeResiden').data('slider').getValue();
      var otherVals = Number($('#retailValText').val()) + Number($('#officeValText').val());
      var available = MAX_STORIES - otherVals;
      $('#typeResiden').slider('setAttribute', 'max', available);
      $('#typeRetail').slider('setAttribute', 'max', Number($('#retailValText').val()));
      $('#typeOffice').slider('setAttribute', 'max', Number($('#officeValText').val()));

      if (currentItem.fid) {
        onStoriesSliderChange(residenVal, 'residential');
      }
      // Update text area and report 
      $('#residenValText').val(residenVal);
      updateNewScenarioReport();
    });

    // Refresh buttons
    $('#refresh-all').on('click', function () {
      loadInitialGraphics();
      graphicsLyrSelectionSym.removeAll();
      initialHtmlElems();
    });

    $('#refresh-current').on('click', function () {
      console.log('refresh current');
      refreshCurrent();
    });

    // Popup
    $('.popup-close').on('click', function () {
      graphicsLyrSelectionSym.removeAll();
      $('#new-building-popup').popup('hide');
      $('#report-popup').popup('hide');
    });

    $('.popup-submit').on('click', function () {
      $('#new-building-popup').popup('hide');
      currentItem.fid = $('#popup-name').val();
      var attrs = $.extend(true, {}, attributesTemplate);
      //console.log(currentItem.fid);
      var coor = currentItem.geometry;
      var totalH;
      attrs.fid = currentItem.fid;
      attrs.width = 25;
      attrs.depth = 25;
      attrs.retailStory = 1;
      attrs.retailStoryHeight = 1 * FLOOR_HEIGHT_B;
      attrs.officeStory = 1;
      attrs.officeStoryHeight = 1 * FLOOR_HEIGHT_A;
      attrs.residentialStory = 1;
      attrs.residentialStoryHeight = 1 * FLOOR_HEIGHT_A;
      currentItem.attributes = attrs;
      totalH = attrs.retailStoryHeight + attrs.officeStoryHeight + attrs.residentialStoryHeight;
      //console.log(currentItem)
      identifySelection(coor.x, coor.y, totalH, attrs);

      if (attrs.retailStory > 0) {
        createGraphicStories(attrs.retailStory, attrs, FLOOR_HEIGHT_B, coor, 0, boxColor.retail);
      }
      if (attrs.officeStory > 0) {
        createGraphicStories(attrs.officeStory, attrs, FLOOR_HEIGHT_A, coor, attrs.retailStoryHeight, boxColor.office);
      }
      if (attrs.residentialStory > 0) {
        var bottomZ = attrs.retailStoryHeight + attrs.officeStoryHeight;
        createGraphicStories(attrs.residentialStory, attrs, FLOOR_HEIGHT_A, coor, bottomZ, boxColor.residential);
      }
      updateHtmlElems(attrs);
      originalReport();
      updateAboutBuilding();
      updateNewScenarioReport();
    });

    $('#report-all').on('click', function () {
      $('#report-popup').popup('show');
      newScenarioVolumeReport();
      updateTotalVolumeReport();
      pieChart(originalDataVol, '#canvasOne', 'Current');
      pieChart(newScenarioDataVol, '#canvasTwo', 'New Scenario');
    });


    $('#explorer').on('click', function(e){
      if ($('#panelExplorer').hasClass('in')){
         //graphicsLyrSelectionSym = false;
        if (graphicsLyrSelectionSym.graphics){
          graphicsLyrSelectionSym.removeAll();
        }
        if (graphicsLyr){
          graphicsLyr.visible = false;
        }
        toggleLayer(true, 'Raleigh Textured Building Models - Raleigh');
      } 
      else {
        loadInitialGraphics();
        graphicsLyr.visible = true;
        graphicsLyrSelectionSym.visible = true;
        toggleLayer(false, 'Raleigh Textured Building Models - Raleigh');
        $('#areaInfoA').collapse('hide');
        $('#panelHelp').collapse('hide');
      }
    });

    //////////////////////////////////////////////////////
    ////////////////// Calcite Maps //////////////////////
    //////////////////////////////////////////////////////
    sceneView.then(function () {
      sceneView.popup.dockOptions.position = 'top-right';
    });

    app.activeView = sceneView;

    app.activeView.then(function () {
      app.initialExtent = app.activeView.extent;
    });

    // Basemap events
    query('#selectBasemapPanel').on('change', function (e) {
      //app.mapView.map.basemap = e.target.options[e.target.selectedIndex].dataset.vector;
      if (e.value == 'planning'){
        toggleLayer(true, 'World Planning 3D Basemap');
      } else {
        toggleLayer(false, 'World Planning 3D Basemap');
        sceneView.map.basemap = e.target.value;
      }
    });

}); //END
