# Builds terrain tiles for the topo map from the elevation data GraphHopper downloads
FROM ghcr.io/osgeo/gdal:ubuntu-small-3.11.4

COPY build_terrain.py /
ENTRYPOINT ["python3", "/build_terrain.py"]
CMD ["/elevation", "/terrain"]
