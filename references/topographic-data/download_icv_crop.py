import rasterio, math, json, hashlib
from rasterio.windows import from_bounds, transform as window_transform
from rasterio.warp import transform_bounds
from pathlib import Path
url='https://descargas.icv.gva.es/dcd/03_mde/02_mdt/2017_PCAS_0100/01_Malla/01_25830_01_Hoja_CV50_03_TIF/030201_MDT_2017PCAS0100_25830_01_Hoja_CV50_0616.tif'
root=Path(__file__).resolve().parent
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='45'):
 with rasterio.open('/vsicurl/'+url) as src:
  print(src.profile,flush=True)
  box=transform_bounds('EPSG:4326',src.crs,-.012,40.092,.012,40.112,densify_pts=101)
  box=(math.floor(box[0])-2,math.floor(box[1])-2,math.ceil(box[2])+2,math.ceil(box[3])+2)
  win=from_bounds(*box,src.transform).round_offsets().round_lengths()
  data=src.read(1,window=win,masked=True)
  assert data.count()==data.size
  profile=src.profile.copy();profile.update(driver='GTiff',width=data.shape[1],height=data.shape[0],transform=window_transform(win,src.transform),compress='deflate',predictor=3,tiled=True,blockxsize=256,blockysize=256)
  out=root/'raw/icv-2017-ground-game-area-1m.tif'
  with rasterio.open(out,'w',**profile) as dst:
   dst.write(data,1);dst.update_tags(attribution='Derived from ICV MDT 2017 Castellon; LiDAR-PNOA 2017 CC BY 4.0 scne.es',processing='Native-grid window extraction from official MTN50 0616 GeoTIFF; no resampling.',elevation_units='metres',height_reference='orthometric',AREA_OR_POINT=src.tags().get('AREA_OR_POINT','Area'))
  report={'source_url':url,'download_method':'HTTP range reads of original GeoTIFF; native 1 m crop only retained','source_original_filename':url.rsplit('/',1)[-1],'source_original_bytes':2071281546,'source_original_crs':src.crs.to_string(),'source_original_dimensions':[src.width,src.height],'source_original_transform':list(src.transform),'source_original_tags':src.tags(),'saved_crop':str(out.relative_to(root)),'crop_dimensions':[data.shape[1],data.shape[0]],'valid_fraction':data.count()/data.size,'crop_min_m':float(data.min()),'crop_max_m':float(data.max()),'crop_bounds_requested':box,'crop_sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'metadata_url':'https://catalogo.icv.gva.es/geonetwork/srv/api/records/spaicv030201_2017PCAS0100/formatters/xml'}
  (root/'sources/icv-crop-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2),flush=True)
