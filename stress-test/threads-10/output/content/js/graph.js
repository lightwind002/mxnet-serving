/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 26852.0, "series": [{"data": [[0.0, 2.0], [0.1, 2.0], [0.2, 344.0], [0.3, 344.0], [0.4, 496.0], [0.5, 636.0], [0.6, 636.0], [0.7, 727.0], [0.8, 727.0], [0.9, 786.0], [1.0, 856.0], [1.1, 856.0], [1.2, 932.0], [1.3, 932.0], [1.4, 992.0], [1.5, 1062.0], [1.6, 1062.0], [1.7, 1132.0], [1.8, 1132.0], [1.9, 1193.0], [2.0, 1276.0], [2.1, 1276.0], [2.2, 1344.0], [2.3, 1344.0], [2.4, 1409.0], [2.5, 1490.0], [2.6, 1490.0], [2.7, 1565.0], [2.8, 1565.0], [2.9, 1651.0], [3.0, 1715.0], [3.1, 1715.0], [3.2, 1786.0], [3.3, 1786.0], [3.4, 1854.0], [3.5, 1913.0], [3.6, 1913.0], [3.7, 1989.0], [3.8, 1989.0], [3.9, 2060.0], [4.0, 2120.0], [4.1, 2120.0], [4.2, 2199.0], [4.3, 2199.0], [4.4, 2256.0], [4.5, 2323.0], [4.6, 2323.0], [4.7, 2402.0], [4.8, 2402.0], [4.9, 2479.0], [5.0, 2539.0], [5.1, 2539.0], [5.2, 2616.0], [5.3, 2616.0], [5.4, 2677.0], [5.5, 2677.0], [5.6, 2738.0], [5.7, 2816.0], [5.8, 2816.0], [5.9, 2888.0], [6.0, 2888.0], [6.1, 2954.0], [6.2, 3013.0], [6.3, 3013.0], [6.4, 3085.0], [6.5, 3085.0], [6.6, 3153.0], [6.7, 3218.0], [6.8, 3218.0], [6.9, 3284.0], [7.0, 3284.0], [7.1, 3346.0], [7.2, 3409.0], [7.3, 3409.0], [7.4, 3477.0], [7.5, 3477.0], [7.6, 3540.0], [7.7, 3619.0], [7.8, 3619.0], [7.9, 3680.0], [8.0, 3680.0], [8.1, 3750.0], [8.2, 3819.0], [8.3, 3819.0], [8.4, 3890.0], [8.5, 3890.0], [8.6, 3955.0], [8.7, 4026.0], [8.8, 4026.0], [8.9, 4090.0], [9.0, 4090.0], [9.1, 4160.0], [9.2, 4224.0], [9.3, 4224.0], [9.4, 4295.0], [9.5, 4362.0], [9.6, 4362.0], [9.7, 4441.0], [9.8, 4441.0], [9.9, 4519.0], [10.0, 4582.0], [10.1, 4582.0], [10.2, 4642.0], [10.3, 4642.0], [10.4, 4714.0], [10.5, 4778.0], [10.6, 4778.0], [10.7, 4846.0], [10.8, 4846.0], [10.9, 4946.0], [11.0, 5000.0], [11.1, 5000.0], [11.2, 5001.0], [11.3, 5001.0], [11.4, 5001.0], [11.5, 5001.0], [11.6, 5001.0], [11.7, 5001.0], [11.8, 5001.0], [11.9, 5001.0], [12.0, 5001.0], [12.1, 5001.0], [12.2, 5001.0], [12.3, 5001.0], [12.4, 5001.0], [12.5, 5001.0], [12.6, 5001.0], [12.7, 5001.0], [12.8, 5001.0], [12.9, 5001.0], [13.0, 5001.0], [13.1, 5001.0], [13.2, 5001.0], [13.3, 5001.0], [13.4, 5001.0], [13.5, 5001.0], [13.6, 5001.0], [13.7, 5001.0], [13.8, 5001.0], [13.9, 5001.0], [14.0, 5002.0], [14.1, 5002.0], [14.2, 5002.0], [14.3, 5002.0], [14.4, 5002.0], [14.5, 5002.0], [14.6, 5002.0], [14.7, 5002.0], [14.8, 5002.0], [14.9, 5002.0], [15.0, 5002.0], [15.1, 5002.0], [15.2, 5002.0], [15.3, 5002.0], [15.4, 5002.0], [15.5, 5002.0], [15.6, 5002.0], [15.7, 5002.0], [15.8, 5002.0], [15.9, 5002.0], [16.0, 5002.0], [16.1, 5002.0], [16.2, 5002.0], [16.3, 5002.0], [16.4, 5002.0], [16.5, 5002.0], [16.6, 5002.0], [16.7, 5002.0], [16.8, 5002.0], [16.9, 5002.0], [17.0, 5002.0], [17.1, 5002.0], [17.2, 5002.0], [17.3, 5002.0], [17.4, 5002.0], [17.5, 5002.0], [17.6, 5002.0], [17.7, 5002.0], [17.8, 5002.0], [17.9, 5002.0], [18.0, 5002.0], [18.1, 5002.0], [18.2, 5002.0], [18.3, 5002.0], [18.4, 5002.0], [18.5, 5002.0], [18.6, 5002.0], [18.7, 5002.0], [18.8, 5002.0], [18.9, 5002.0], [19.0, 5003.0], [19.1, 5003.0], [19.2, 5003.0], [19.3, 5003.0], [19.4, 5003.0], [19.5, 5003.0], [19.6, 5003.0], [19.7, 5003.0], [19.8, 5003.0], [19.9, 5003.0], [20.0, 5003.0], [20.1, 5003.0], [20.2, 5003.0], [20.3, 5003.0], [20.4, 5003.0], [20.5, 5003.0], [20.6, 5003.0], [20.7, 5003.0], [20.8, 5003.0], [20.9, 5003.0], [21.0, 5003.0], [21.1, 5003.0], [21.2, 5003.0], [21.3, 5003.0], [21.4, 5003.0], [21.5, 5003.0], [21.6, 5003.0], [21.7, 5003.0], [21.8, 5003.0], [21.9, 5003.0], [22.0, 5004.0], [22.1, 5004.0], [22.2, 5004.0], [22.3, 5004.0], [22.4, 5004.0], [22.5, 5004.0], [22.6, 5004.0], [22.7, 5004.0], [22.8, 5004.0], [22.9, 5004.0], [23.0, 5004.0], [23.1, 5004.0], [23.2, 5004.0], [23.3, 5004.0], [23.4, 5004.0], [23.5, 5004.0], [23.6, 5004.0], [23.7, 5004.0], [23.8, 5004.0], [23.9, 5004.0], [24.0, 5004.0], [24.1, 5004.0], [24.2, 5004.0], [24.3, 5004.0], [24.4, 5004.0], [24.5, 5004.0], [24.6, 5004.0], [24.7, 5004.0], [24.8, 5004.0], [24.9, 5004.0], [25.0, 5004.0], [25.1, 5004.0], [25.2, 5004.0], [25.3, 5004.0], [25.4, 5004.0], [25.5, 5004.0], [25.6, 5004.0], [25.7, 5004.0], [25.8, 5004.0], [25.9, 5004.0], [26.0, 5004.0], [26.1, 5004.0], [26.2, 5004.0], [26.3, 5004.0], [26.4, 5005.0], [26.5, 5005.0], [26.6, 5005.0], [26.7, 5005.0], [26.8, 5005.0], [26.9, 5005.0], [27.0, 5005.0], [27.1, 5005.0], [27.2, 5005.0], [27.3, 5005.0], [27.4, 5005.0], [27.5, 5005.0], [27.6, 5005.0], [27.7, 5005.0], [27.8, 5005.0], [27.9, 5005.0], [28.0, 5005.0], [28.1, 5005.0], [28.2, 5005.0], [28.3, 5005.0], [28.4, 5005.0], [28.5, 5005.0], [28.6, 5005.0], [28.7, 5005.0], [28.8, 5005.0], [28.9, 5005.0], [29.0, 5005.0], [29.1, 5005.0], [29.2, 5006.0], [29.3, 5006.0], [29.4, 5006.0], [29.5, 5006.0], [29.6, 5006.0], [29.7, 5006.0], [29.8, 5006.0], [29.9, 5006.0], [30.0, 5006.0], [30.1, 5006.0], [30.2, 5006.0], [30.3, 5006.0], [30.4, 5006.0], [30.5, 5006.0], [30.6, 5006.0], [30.7, 5007.0], [30.8, 5007.0], [30.9, 5008.0], [31.0, 5081.0], [31.1, 5081.0], [31.2, 5155.0], [31.3, 5155.0], [31.4, 5237.0], [31.5, 5304.0], [31.6, 5304.0], [31.7, 5365.0], [31.8, 5365.0], [31.9, 5438.0], [32.0, 5517.0], [32.1, 5517.0], [32.2, 5585.0], [32.3, 5585.0], [32.4, 5654.0], [32.5, 5722.0], [32.6, 5722.0], [32.7, 5797.0], [32.8, 5797.0], [32.9, 5872.0], [33.0, 5936.0], [33.1, 5936.0], [33.2, 5999.0], [33.3, 5999.0], [33.4, 6075.0], [33.5, 6175.0], [33.6, 6175.0], [33.7, 6245.0], [33.8, 6245.0], [33.9, 6314.0], [34.0, 6381.0], [34.1, 6381.0], [34.2, 6448.0], [34.3, 6448.0], [34.4, 6523.0], [34.5, 6596.0], [34.6, 6596.0], [34.7, 6665.0], [34.8, 6665.0], [34.9, 6731.0], [35.0, 6811.0], [35.1, 6811.0], [35.2, 6878.0], [35.3, 6878.0], [35.4, 6954.0], [35.5, 7024.0], [35.6, 7024.0], [35.7, 7098.0], [35.8, 7098.0], [35.9, 7173.0], [36.0, 7244.0], [36.1, 7244.0], [36.2, 7312.0], [36.3, 7312.0], [36.4, 7388.0], [36.5, 7461.0], [36.6, 7461.0], [36.7, 7535.0], [36.8, 7535.0], [36.9, 7601.0], [37.0, 7668.0], [37.1, 7668.0], [37.2, 7750.0], [37.3, 7750.0], [37.4, 7825.0], [37.5, 7895.0], [37.6, 7895.0], [37.7, 7968.0], [37.8, 7968.0], [37.9, 8041.0], [38.0, 8114.0], [38.1, 8114.0], [38.2, 8189.0], [38.3, 8189.0], [38.4, 8260.0], [38.5, 8334.0], [38.6, 8334.0], [38.7, 8405.0], [38.8, 8405.0], [38.9, 8476.0], [39.0, 8554.0], [39.1, 8554.0], [39.2, 8626.0], [39.3, 8626.0], [39.4, 8702.0], [39.5, 8779.0], [39.6, 8779.0], [39.7, 8853.0], [39.8, 8853.0], [39.9, 8941.0], [40.0, 9004.0], [40.1, 9004.0], [40.2, 9078.0], [40.3, 9078.0], [40.4, 9163.0], [40.5, 9236.0], [40.6, 9236.0], [40.7, 9307.0], [40.8, 9307.0], [40.9, 9376.0], [41.0, 9454.0], [41.1, 9454.0], [41.2, 9537.0], [41.3, 9537.0], [41.4, 9615.0], [41.5, 9687.0], [41.6, 9687.0], [41.7, 9779.0], [41.8, 9779.0], [41.9, 9877.0], [42.0, 9957.0], [42.1, 9957.0], [42.2, 10026.0], [42.3, 10026.0], [42.4, 10100.0], [42.5, 10176.0], [42.6, 10176.0], [42.7, 10252.0], [42.8, 10252.0], [42.9, 10324.0], [43.0, 10401.0], [43.1, 10401.0], [43.2, 10479.0], [43.3, 10479.0], [43.4, 10550.0], [43.5, 10629.0], [43.6, 10629.0], [43.7, 10677.0], [43.8, 10677.0], [43.9, 10782.0], [44.0, 10858.0], [44.1, 10858.0], [44.2, 10934.0], [44.3, 10934.0], [44.4, 11009.0], [44.5, 11086.0], [44.6, 11086.0], [44.7, 11177.0], [44.8, 11177.0], [44.9, 11257.0], [45.0, 11341.0], [45.1, 11341.0], [45.2, 11412.0], [45.3, 11412.0], [45.4, 11485.0], [45.5, 11559.0], [45.6, 11559.0], [45.7, 11642.0], [45.8, 11642.0], [45.9, 11722.0], [46.0, 11804.0], [46.1, 11804.0], [46.2, 11887.0], [46.3, 11887.0], [46.4, 11987.0], [46.5, 12066.0], [46.6, 12066.0], [46.7, 12191.0], [46.8, 12191.0], [46.9, 12283.0], [47.0, 12373.0], [47.1, 12373.0], [47.2, 12466.0], [47.3, 12466.0], [47.4, 12564.0], [47.5, 12676.0], [47.6, 12676.0], [47.7, 12775.0], [47.8, 12775.0], [47.9, 12855.0], [48.0, 12946.0], [48.1, 12946.0], [48.2, 13049.0], [48.3, 13049.0], [48.4, 13139.0], [48.5, 13229.0], [48.6, 13229.0], [48.7, 13309.0], [48.8, 13309.0], [48.9, 13385.0], [49.0, 13457.0], [49.1, 13457.0], [49.2, 13531.0], [49.3, 13531.0], [49.4, 13614.0], [49.5, 13691.0], [49.6, 13691.0], [49.7, 13766.0], [49.8, 13766.0], [49.9, 13842.0], [50.0, 13918.0], [50.1, 13918.0], [50.2, 14000.0], [50.3, 14000.0], [50.4, 14075.0], [50.5, 14151.0], [50.6, 14151.0], [50.7, 14227.0], [50.8, 14227.0], [50.9, 14305.0], [51.0, 14401.0], [51.1, 14401.0], [51.2, 14483.0], [51.3, 14483.0], [51.4, 14560.0], [51.5, 14633.0], [51.6, 14633.0], [51.7, 14720.0], [51.8, 14720.0], [51.9, 14797.0], [52.0, 14869.0], [52.1, 14869.0], [52.2, 14954.0], [52.3, 14954.0], [52.4, 15034.0], [52.5, 15112.0], [52.6, 15112.0], [52.7, 15186.0], [52.8, 15186.0], [52.9, 15266.0], [53.0, 15338.0], [53.1, 15338.0], [53.2, 15417.0], [53.3, 15417.0], [53.4, 15528.0], [53.5, 15607.0], [53.6, 15607.0], [53.7, 15682.0], [53.8, 15682.0], [53.9, 15757.0], [54.0, 15831.0], [54.1, 15831.0], [54.2, 15913.0], [54.3, 15913.0], [54.4, 15995.0], [54.5, 16065.0], [54.6, 16065.0], [54.7, 16139.0], [54.8, 16139.0], [54.9, 16217.0], [55.0, 16296.0], [55.1, 16296.0], [55.2, 16372.0], [55.3, 16372.0], [55.4, 16447.0], [55.5, 16525.0], [55.6, 16525.0], [55.7, 16603.0], [55.8, 16603.0], [55.9, 16685.0], [56.0, 16765.0], [56.1, 16765.0], [56.2, 16847.0], [56.3, 16847.0], [56.4, 16926.0], [56.5, 17004.0], [56.6, 17004.0], [56.7, 17082.0], [56.8, 17082.0], [56.9, 17165.0], [57.0, 17239.0], [57.1, 17239.0], [57.2, 17315.0], [57.3, 17315.0], [57.4, 17390.0], [57.5, 17468.0], [57.6, 17468.0], [57.7, 17546.0], [57.8, 17546.0], [57.9, 17632.0], [58.0, 17702.0], [58.1, 17702.0], [58.2, 17781.0], [58.3, 17781.0], [58.4, 17857.0], [58.5, 17942.0], [58.6, 17942.0], [58.7, 18011.0], [58.8, 18011.0], [58.9, 18083.0], [59.0, 18164.0], [59.1, 18164.0], [59.2, 18241.0], [59.3, 18241.0], [59.4, 18320.0], [59.5, 18395.0], [59.6, 18395.0], [59.7, 18574.0], [59.8, 18574.0], [59.9, 18650.0], [60.0, 18717.0], [60.1, 18717.0], [60.2, 18791.0], [60.3, 18791.0], [60.4, 18869.0], [60.5, 18943.0], [60.6, 18943.0], [60.7, 19013.0], [60.8, 19013.0], [60.9, 19085.0], [61.0, 19171.0], [61.1, 19171.0], [61.2, 19241.0], [61.3, 19241.0], [61.4, 19326.0], [61.5, 19401.0], [61.6, 19401.0], [61.7, 19474.0], [61.8, 19474.0], [61.9, 19557.0], [62.0, 19637.0], [62.1, 19637.0], [62.2, 19714.0], [62.3, 19714.0], [62.4, 19786.0], [62.5, 19860.0], [62.6, 19860.0], [62.7, 19941.0], [62.8, 19941.0], [62.9, 20019.0], [63.0, 20089.0], [63.1, 20089.0], [63.2, 20172.0], [63.3, 20172.0], [63.4, 20250.0], [63.5, 20317.0], [63.6, 20317.0], [63.7, 20391.0], [63.8, 20391.0], [63.9, 20472.0], [64.0, 20547.0], [64.1, 20547.0], [64.2, 20652.0], [64.3, 20652.0], [64.4, 20754.0], [64.5, 20871.0], [64.6, 20871.0], [64.7, 20941.0], [64.8, 20941.0], [64.9, 21012.0], [65.0, 21089.0], [65.1, 21089.0], [65.2, 21163.0], [65.3, 21163.0], [65.4, 21248.0], [65.5, 21322.0], [65.6, 21322.0], [65.7, 21391.0], [65.8, 21391.0], [65.9, 21470.0], [66.0, 21536.0], [66.1, 21536.0], [66.2, 21614.0], [66.3, 21614.0], [66.4, 21688.0], [66.5, 21762.0], [66.6, 21762.0], [66.7, 21836.0], [66.8, 21836.0], [66.9, 21913.0], [67.0, 21991.0], [67.1, 21991.0], [67.2, 22075.0], [67.3, 22075.0], [67.4, 22151.0], [67.5, 22232.0], [67.6, 22232.0], [67.7, 22302.0], [67.8, 22302.0], [67.9, 22380.0], [68.0, 22460.0], [68.1, 22460.0], [68.2, 22535.0], [68.3, 22535.0], [68.4, 22613.0], [68.5, 22688.0], [68.6, 22688.0], [68.7, 22797.0], [68.8, 22797.0], [68.9, 22803.0], [69.0, 22807.0], [69.1, 22807.0], [69.2, 22818.0], [69.3, 22818.0], [69.4, 22825.0], [69.5, 22833.0], [69.6, 22833.0], [69.7, 22844.0], [69.8, 22844.0], [69.9, 22857.0], [70.0, 22859.0], [70.1, 22859.0], [70.2, 22870.0], [70.3, 22870.0], [70.4, 22871.0], [70.5, 22877.0], [70.6, 22877.0], [70.7, 22877.0], [70.8, 22877.0], [70.9, 22879.0], [71.0, 22883.0], [71.1, 22883.0], [71.2, 22883.0], [71.3, 22883.0], [71.4, 22889.0], [71.5, 22891.0], [71.6, 22891.0], [71.7, 22901.0], [71.8, 22901.0], [71.9, 22902.0], [72.0, 22904.0], [72.1, 22904.0], [72.2, 22927.0], [72.3, 22927.0], [72.4, 22933.0], [72.5, 22940.0], [72.6, 22940.0], [72.7, 22955.0], [72.8, 22955.0], [72.9, 22962.0], [73.0, 22983.0], [73.1, 22983.0], [73.2, 22988.0], [73.3, 22988.0], [73.4, 22991.0], [73.5, 22996.0], [73.6, 22996.0], [73.7, 22998.0], [73.8, 22998.0], [73.9, 23012.0], [74.0, 23025.0], [74.1, 23025.0], [74.2, 23034.0], [74.3, 23034.0], [74.4, 23036.0], [74.5, 23047.0], [74.6, 23047.0], [74.7, 23054.0], [74.8, 23054.0], [74.9, 23058.0], [75.0, 23069.0], [75.1, 23069.0], [75.2, 23069.0], [75.3, 23069.0], [75.4, 23073.0], [75.5, 23074.0], [75.6, 23074.0], [75.7, 23075.0], [75.8, 23075.0], [75.9, 23076.0], [76.0, 23077.0], [76.1, 23077.0], [76.2, 23078.0], [76.3, 23078.0], [76.4, 23080.0], [76.5, 23084.0], [76.6, 23084.0], [76.7, 23090.0], [76.8, 23090.0], [76.9, 23091.0], [77.0, 23099.0], [77.1, 23099.0], [77.2, 23103.0], [77.3, 23103.0], [77.4, 23104.0], [77.5, 23106.0], [77.6, 23106.0], [77.7, 23107.0], [77.8, 23107.0], [77.9, 23109.0], [78.0, 23109.0], [78.1, 23109.0], [78.2, 23115.0], [78.3, 23115.0], [78.4, 23116.0], [78.5, 23116.0], [78.6, 23116.0], [78.7, 23118.0], [78.8, 23118.0], [78.9, 23121.0], [79.0, 23121.0], [79.1, 23121.0], [79.2, 23122.0], [79.3, 23122.0], [79.4, 23123.0], [79.5, 23127.0], [79.6, 23127.0], [79.7, 23128.0], [79.8, 23128.0], [79.9, 23131.0], [80.0, 23135.0], [80.1, 23135.0], [80.2, 23137.0], [80.3, 23137.0], [80.4, 23144.0], [80.5, 23145.0], [80.6, 23145.0], [80.7, 23146.0], [80.8, 23146.0], [80.9, 23155.0], [81.0, 23164.0], [81.1, 23164.0], [81.2, 23178.0], [81.3, 23178.0], [81.4, 23191.0], [81.5, 23192.0], [81.6, 23192.0], [81.7, 23200.0], [81.8, 23200.0], [81.9, 23202.0], [82.0, 23202.0], [82.1, 23202.0], [82.2, 23204.0], [82.3, 23204.0], [82.4, 23206.0], [82.5, 23206.0], [82.6, 23206.0], [82.7, 23206.0], [82.8, 23206.0], [82.9, 23208.0], [83.0, 23211.0], [83.1, 23211.0], [83.2, 23211.0], [83.3, 23211.0], [83.4, 23214.0], [83.5, 23223.0], [83.6, 23223.0], [83.7, 23229.0], [83.8, 23229.0], [83.9, 23234.0], [84.0, 23235.0], [84.1, 23235.0], [84.2, 23241.0], [84.3, 23241.0], [84.4, 23242.0], [84.5, 23244.0], [84.6, 23244.0], [84.7, 23248.0], [84.8, 23248.0], [84.9, 23256.0], [85.0, 23256.0], [85.1, 23258.0], [85.2, 23259.0], [85.3, 23259.0], [85.4, 23263.0], [85.5, 23263.0], [85.6, 23269.0], [85.7, 23272.0], [85.8, 23272.0], [85.9, 23275.0], [86.0, 23275.0], [86.1, 23288.0], [86.2, 23294.0], [86.3, 23294.0], [86.4, 23329.0], [86.5, 23329.0], [86.6, 23340.0], [86.7, 23345.0], [86.8, 23345.0], [86.9, 23356.0], [87.0, 23356.0], [87.1, 23369.0], [87.2, 23404.0], [87.3, 23404.0], [87.4, 23428.0], [87.5, 23428.0], [87.6, 23432.0], [87.7, 23443.0], [87.8, 23443.0], [87.9, 23455.0], [88.0, 23455.0], [88.1, 23510.0], [88.2, 23514.0], [88.3, 23514.0], [88.4, 23558.0], [88.5, 23558.0], [88.6, 23595.0], [88.7, 23629.0], [88.8, 23629.0], [88.9, 23659.0], [89.0, 23659.0], [89.1, 23661.0], [89.2, 23732.0], [89.3, 23732.0], [89.4, 23744.0], [89.5, 23744.0], [89.6, 23750.0], [89.7, 23781.0], [89.8, 23781.0], [89.9, 23794.0], [90.0, 23794.0], [90.1, 23824.0], [90.2, 23848.0], [90.3, 23848.0], [90.4, 23852.0], [90.5, 23852.0], [90.6, 23853.0], [90.7, 23853.0], [90.8, 23853.0], [90.9, 23882.0], [91.0, 23882.0], [91.1, 23917.0], [91.2, 23969.0], [91.3, 23969.0], [91.4, 23979.0], [91.5, 23979.0], [91.6, 23996.0], [91.7, 24058.0], [91.8, 24058.0], [91.9, 24128.0], [92.0, 24128.0], [92.1, 24159.0], [92.2, 24167.0], [92.3, 24167.0], [92.4, 24181.0], [92.5, 24181.0], [92.6, 24213.0], [92.7, 24224.0], [92.8, 24224.0], [92.9, 24251.0], [93.0, 24251.0], [93.1, 24271.0], [93.2, 24278.0], [93.3, 24278.0], [93.4, 24303.0], [93.5, 24303.0], [93.6, 24322.0], [93.7, 24359.0], [93.8, 24359.0], [93.9, 24379.0], [94.0, 24379.0], [94.1, 24386.0], [94.2, 24664.0], [94.3, 24664.0], [94.4, 24702.0], [94.5, 24702.0], [94.6, 24731.0], [94.7, 24766.0], [94.8, 24766.0], [94.9, 24779.0], [95.0, 24779.0], [95.1, 24789.0], [95.2, 24806.0], [95.3, 24806.0], [95.4, 24822.0], [95.5, 24822.0], [95.6, 24860.0], [95.7, 24876.0], [95.8, 24876.0], [95.9, 24929.0], [96.0, 24929.0], [96.1, 24958.0], [96.2, 24960.0], [96.3, 24960.0], [96.4, 24987.0], [96.5, 24987.0], [96.6, 25009.0], [96.7, 25035.0], [96.8, 25035.0], [96.9, 25064.0], [97.0, 25064.0], [97.1, 25081.0], [97.2, 25084.0], [97.3, 25084.0], [97.4, 25093.0], [97.5, 25093.0], [97.6, 25104.0], [97.7, 25171.0], [97.8, 25171.0], [97.9, 25183.0], [98.0, 25183.0], [98.1, 25791.0], [98.2, 25843.0], [98.3, 25843.0], [98.4, 25871.0], [98.5, 25871.0], [98.6, 25918.0], [98.7, 25993.0], [98.8, 25993.0], [98.9, 26022.0], [99.0, 26022.0], [99.1, 26246.0], [99.2, 26296.0], [99.3, 26296.0], [99.4, 26453.0], [99.5, 26453.0], [99.6, 26749.0], [99.7, 26754.0], [99.8, 26754.0], [99.9, 26852.0], [100.0, 26852.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 121.0, "series": [{"data": [[0.0, 1.0], [300.0, 1.0], [400.0, 1.0], [600.0, 1.0], [700.0, 2.0], [800.0, 1.0], [900.0, 2.0], [1000.0, 1.0], [1100.0, 2.0], [1200.0, 1.0], [1300.0, 1.0], [1400.0, 2.0], [1500.0, 1.0], [1600.0, 1.0], [1700.0, 2.0], [1800.0, 1.0], [1900.0, 2.0], [2000.0, 1.0], [2100.0, 2.0], [2200.0, 1.0], [2300.0, 1.0], [2400.0, 2.0], [2500.0, 1.0], [2600.0, 2.0], [2700.0, 1.0], [2800.0, 2.0], [2900.0, 1.0], [3000.0, 2.0], [3100.0, 1.0], [3200.0, 2.0], [3300.0, 1.0], [3400.0, 2.0], [3500.0, 1.0], [3600.0, 2.0], [3700.0, 1.0], [3800.0, 2.0], [3900.0, 1.0], [4000.0, 2.0], [4100.0, 1.0], [4200.0, 2.0], [4300.0, 1.0], [4400.0, 1.0], [4500.0, 2.0], [4600.0, 1.0], [4700.0, 2.0], [4800.0, 1.0], [4900.0, 1.0], [5000.0, 121.0], [5100.0, 1.0], [5200.0, 1.0], [5300.0, 2.0], [5400.0, 1.0], [5500.0, 2.0], [5600.0, 1.0], [5700.0, 2.0], [5800.0, 1.0], [5900.0, 2.0], [6000.0, 1.0], [6100.0, 1.0], [6200.0, 1.0], [6300.0, 2.0], [6400.0, 1.0], [6500.0, 2.0], [6600.0, 1.0], [6700.0, 1.0], [6800.0, 2.0], [6900.0, 1.0], [7000.0, 2.0], [7100.0, 1.0], [7200.0, 1.0], [7300.0, 2.0], [7400.0, 1.0], [7500.0, 1.0], [7600.0, 2.0], [7700.0, 1.0], [7800.0, 2.0], [7900.0, 1.0], [8000.0, 1.0], [8100.0, 2.0], [8200.0, 1.0], [8300.0, 1.0], [8400.0, 2.0], [8500.0, 1.0], [8600.0, 1.0], [8700.0, 2.0], [8800.0, 1.0], [8900.0, 1.0], [9000.0, 2.0], [9100.0, 1.0], [9200.0, 1.0], [9300.0, 2.0], [9400.0, 1.0], [9500.0, 1.0], [9600.0, 2.0], [9700.0, 1.0], [9800.0, 1.0], [9900.0, 1.0], [10000.0, 1.0], [10100.0, 2.0], [10200.0, 1.0], [10300.0, 1.0], [10400.0, 2.0], [10500.0, 1.0], [10600.0, 2.0], [10700.0, 1.0], [10800.0, 1.0], [10900.0, 1.0], [11000.0, 2.0], [11100.0, 1.0], [11200.0, 1.0], [11300.0, 1.0], [11400.0, 2.0], [11500.0, 1.0], [11600.0, 1.0], [11700.0, 1.0], [11800.0, 2.0], [11900.0, 1.0], [12000.0, 1.0], [12100.0, 1.0], [12200.0, 1.0], [12300.0, 1.0], [12400.0, 1.0], [12500.0, 1.0], [12600.0, 1.0], [12700.0, 1.0], [12800.0, 1.0], [12900.0, 1.0], [13000.0, 1.0], [13100.0, 1.0], [13200.0, 1.0], [13300.0, 2.0], [13400.0, 1.0], [13500.0, 1.0], [13600.0, 2.0], [13700.0, 1.0], [13800.0, 1.0], [13900.0, 1.0], [14000.0, 2.0], [14100.0, 1.0], [14200.0, 1.0], [14300.0, 1.0], [14400.0, 2.0], [14500.0, 1.0], [14600.0, 1.0], [14700.0, 2.0], [14800.0, 1.0], [14900.0, 1.0], [15000.0, 1.0], [15100.0, 2.0], [15200.0, 1.0], [15300.0, 1.0], [15400.0, 1.0], [15500.0, 1.0], [15600.0, 2.0], [15700.0, 1.0], [15800.0, 1.0], [15900.0, 2.0], [16000.0, 1.0], [16100.0, 1.0], [16200.0, 2.0], [16300.0, 1.0], [17200.0, 1.0], [16400.0, 1.0], [16600.0, 2.0], [16800.0, 1.0], [17000.0, 2.0], [17400.0, 1.0], [17600.0, 1.0], [17800.0, 1.0], [18000.0, 2.0], [18200.0, 1.0], [19200.0, 1.0], [18600.0, 1.0], [18800.0, 1.0], [19000.0, 2.0], [19400.0, 2.0], [19600.0, 1.0], [19800.0, 1.0], [20000.0, 2.0], [20200.0, 1.0], [20400.0, 1.0], [20600.0, 1.0], [20800.0, 1.0], [21000.0, 2.0], [21200.0, 1.0], [21400.0, 1.0], [21600.0, 2.0], [21800.0, 1.0], [22000.0, 1.0], [22200.0, 1.0], [22400.0, 1.0], [22600.0, 2.0], [22800.0, 17.0], [23000.0, 20.0], [23200.0, 28.0], [23400.0, 5.0], [23800.0, 6.0], [24200.0, 5.0], [23600.0, 3.0], [24000.0, 1.0], [25000.0, 6.0], [24800.0, 4.0], [24600.0, 1.0], [26400.0, 1.0], [26200.0, 2.0], [26000.0, 1.0], [25800.0, 2.0], [26800.0, 1.0], [16500.0, 1.0], [16700.0, 1.0], [16900.0, 1.0], [17100.0, 1.0], [17300.0, 2.0], [17500.0, 1.0], [17700.0, 2.0], [17900.0, 1.0], [18100.0, 1.0], [18300.0, 2.0], [18500.0, 1.0], [18700.0, 2.0], [18900.0, 1.0], [19100.0, 1.0], [19300.0, 1.0], [19500.0, 1.0], [19700.0, 2.0], [19900.0, 1.0], [20100.0, 1.0], [20300.0, 2.0], [20500.0, 1.0], [20700.0, 1.0], [20900.0, 1.0], [21100.0, 1.0], [21300.0, 2.0], [21500.0, 1.0], [21700.0, 1.0], [21900.0, 2.0], [22100.0, 1.0], [22300.0, 2.0], [22500.0, 1.0], [22900.0, 13.0], [23100.0, 27.0], [23500.0, 4.0], [23300.0, 5.0], [22700.0, 1.0], [23700.0, 5.0], [24300.0, 5.0], [23900.0, 4.0], [24100.0, 4.0], [25100.0, 3.0], [24900.0, 4.0], [24700.0, 5.0], [25700.0, 1.0], [25900.0, 2.0], [26700.0, 2.0]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 26800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 2.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 465.0, "series": [{"data": [[1.0, 13.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 120.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 465.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 13.846153846153847, "minX": 1.52524638E12, "maxY": 132.27692307692308, "series": [{"data": [[1.5252465E12, 72.1515151515152], [1.52524638E12, 13.846153846153847], [1.52524644E12, 132.27692307692308]], "isOverall": false, "label": "Scenario 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5252465E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 344.0, "minX": 4.0, "maxY": 25993.0, "series": [{"data": [[4.0, 344.0], [6.0, 25993.0], [7.0, 13207.0], [9.0, 17450.0], [11.0, 13259.0], [12.0, 17684.666666666668], [14.0, 17272.0], [15.0, 962.0], [16.0, 23824.0], [17.0, 12455.0], [18.0, 12456.5], [19.0, 9057.0], [20.0, 12605.5], [21.0, 1487.0], [22.0, 22951.5], [23.0, 1651.0], [24.0, 8947.0], [25.0, 17136.333333333332], [26.0, 1951.0], [27.0, 16612.333333333332], [28.0, 9067.333333333332], [29.0, 12681.5], [30.0, 13626.0], [31.0, 9379.666666666668], [32.0, 9474.666666666668], [33.0, 13066.0], [34.0, 13398.0], [35.0, 9524.666666666668], [36.0, 13915.0], [37.0, 9662.333333333332], [38.0, 3153.0], [39.0, 14021.75], [40.0, 3346.0], [41.0, 14041.0], [42.0, 13208.5], [43.0, 3649.5], [44.0, 13273.5], [45.0, 13424.0], [46.0, 3955.0], [47.0, 13725.5], [48.0, 13550.0], [49.0, 10493.666666666668], [50.0, 4362.0], [51.0, 14218.5], [52.0, 9140.25], [53.0, 22844.0], [54.0, 10787.666666666668], [55.0, 10898.0], [57.0, 13945.0], [56.0, 17856.666666666668], [58.0, 5196.0], [59.0, 17013.666666666668], [60.0, 14112.0], [61.0, 14158.5], [62.0, 11334.333333333332], [63.0, 5654.0], [64.0, 14426.25], [65.0, 5872.0], [66.0, 14459.5], [67.0, 11826.0], [68.0, 12182.666666666668], [70.0, 11933.0], [71.0, 6485.5], [69.0, 24021.0], [72.0, 15164.0], [73.0, 15812.5], [74.0, 17612.333333333332], [75.0, 6844.5], [76.0, 18181.666666666668], [77.0, 12370.0], [78.0, 7208.5], [79.0, 15215.0], [80.0, 15415.5], [81.0, 15814.0], [82.0, 15265.5], [83.0, 15511.0], [84.0, 7822.5], [85.0, 15772.5], [86.0, 8041.0], [87.0, 23036.0], [88.0, 14562.6], [90.0, 8334.0], [91.0, 13972.0], [89.0, 25009.0], [92.0, 19462.0], [93.0, 8626.0], [94.0, 13563.0], [95.0, 19575.0], [96.0, 9009.5], [97.0, 18392.666666666668], [98.0, 9163.0], [99.0, 13913.0], [100.0, 16579.5], [101.0, 14423.0], [102.0, 16881.75], [103.0, 16562.0], [104.0, 9877.0], [106.0, 18760.0], [107.0, 14424.0], [105.0, 24271.0], [108.0, 10214.0], [110.0, 13580.0], [111.0, 16843.5], [109.0, 25078.5], [113.0, 19756.0], [114.0, 10729.5], [115.0, 14966.0], [117.0, 15756.666666666668], [116.0, 19127.0], [118.0, 11257.0], [119.0, 19265.333333333332], [120.0, 15518.666666666666], [121.0, 18371.0], [123.0, 17454.25], [125.0, 16059.0], [124.0, 17774.0], [126.0, 12066.0], [127.0, 17701.0], [128.0, 12283.0], [129.0, 17801.0], [130.0, 12466.0], [131.0, 19708.0], [132.0, 18527.5], [133.0, 17990.5], [134.0, 18045.0], [135.0, 18151.0], [136.0, 11755.25], [137.0, 13139.0], [138.0, 13834.333333333332], [139.0, 13347.0], [140.0, 13457.0], [141.0, 18361.0], [142.0, 13652.5], [143.0, 13766.0], [144.0, 20158.0], [146.0, 13996.5], [147.0, 17146.333333333332], [149.0, 14209.5], [150.0, 14181.333333333332], [151.0, 9744.0], [148.0, 5004.0], [145.0, 24359.0], [152.0, 14596.5], [153.0, 17588.333333333332], [154.0, 20020.0], [155.0, 14954.0], [156.0, 19113.0], [157.0, 11766.333333333334], [158.0, 14108.0], [159.0, 10151.75], [160.0, 19580.5], [161.0, 15863.428571428569], [162.0, 14694.181818181816], [163.0, 15038.317073170732], [164.0, 13768.057692307693], [165.0, 12927.555555555553], [166.0, 13475.093023255817], [167.0, 12152.0], [168.0, 10613.333333333334]], "isOverall": false, "label": "inference", "isController": false}, {"data": [[116.4833333333333, 13905.971666666657]], "isOverall": false, "label": "inference-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 168.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 1232.55, "minX": 1.52524638E12, "maxY": 82220.76666666666, "series": [{"data": [[1.5252465E12, 30225.95], [1.52524638E12, 3037.6666666666665], [1.52524644E12, 82220.76666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5252465E12, 12236.35], [1.52524638E12, 1232.55], [1.52524644E12, 32058.75]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5252465E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 905.8461538461539, "minX": 1.52524638E12, "maxY": 23409.053030303035, "series": [{"data": [[1.5252465E12, 23409.053030303035], [1.52524638E12, 905.8461538461539], [1.52524644E12, 11520.465934065935]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5252465E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 904.5384615384617, "minX": 1.52524638E12, "maxY": 23295.340909090926, "series": [{"data": [[1.5252465E12, 23295.340909090926], [1.52524638E12, 904.5384615384617], [1.52524644E12, 10244.784615384624]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5252465E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 7.615384615384615, "minX": 1.52524638E12, "maxY": 1310.912087912087, "series": [{"data": [[1.5252465E12, 973.6818181818179], [1.52524638E12, 7.615384615384615], [1.52524644E12, 1310.912087912087]], "isOverall": false, "label": "inference", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5252465E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 344.0, "minX": 1.52524638E12, "maxY": 26852.0, "series": [{"data": [[1.5252465E12, 26852.0], [1.52524638E12, 1344.0], [1.52524644E12, 25171.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5252465E12, 22797.0], [1.52524638E12, 344.0], [1.52524644E12, 1409.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5252465E12, 24155.9], [1.52524638E12, 1316.8], [1.52524644E12, 23173.4]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5252465E12, 26325.829999999998], [1.52524638E12, 1344.0], [1.52524644E12, 24312.12]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5252465E12, 24956.55], [1.52524638E12, 1344.0], [1.52524644E12, 23392.6]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5252465E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 932.0, "minX": 0.0, "maxY": 23269.0, "series": [{"data": [[0.0, 932.0], [2.0, 23269.0], [7.0, 14037.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2.0, 5002.0], [7.0, 5003.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 23269.0, "series": [{"data": [[0.0, 931.0], [2.0, 23269.0], [7.0, 14037.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2.0, 0.0], [7.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 7.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.45, "minX": 1.52524638E12, "maxY": 9.55, "series": [{"data": [[1.52524638E12, 0.45], [1.52524644E12, 9.55]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52524644E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52524638E12, "maxY": 5.633333333333334, "series": [{"data": [[1.5252465E12, 2.15], [1.52524638E12, 0.21666666666666667], [1.52524644E12, 5.633333333333334]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5252465E12, 0.05], [1.52524644E12, 1.9333333333333333]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.conn.ConnectTimeoutException", "isController": false}, {"data": [[1.52524644E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5252465E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.05, "minX": 1.52524638E12, "maxY": 5.633333333333334, "series": [{"data": [[1.5252465E12, 2.15], [1.52524638E12, 0.21666666666666667], [1.52524644E12, 5.633333333333334]], "isOverall": false, "label": "inference-success", "isController": false}, {"data": [[1.5252465E12, 0.05], [1.52524644E12, 1.95]], "isOverall": false, "label": "inference-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5252465E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
