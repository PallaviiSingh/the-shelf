import os, glob, json, time
from PIL import Image
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"
SRC=os.path.join(ROOT,"Possible images for the website")
TEX=os.path.join(ROOT,"assets/textures"); os.makedirs(TEX,exist_ok=True)

def find(frag):
    for f in glob.glob(os.path.join(SRC,"*.jpg")):
        if frag in os.path.basename(f): return f
    return None
# (fragment, outname, target width, jpeg quality)
picks=[
 ("museum-of-new-zealand","hero-night.jpg",1800,84),
 ("heather-green","type-collage.jpg",1500,82),
 ("catherine-kay-greenup","river.jpg",1500,82),
 ("susan-wilkinson","paper-soft.jpg",1500,82),
 ("europeana-Fa02","forest.jpg",1500,82),
 ("kseniya-lapteva","petals.jpg",1300,82),
 ("mcgill-library","deco-reader.jpg",1100,84),
]
for frag,out,w,q in picks:
    f=find(frag)
    if not f: print("MISS",frag); continue
    im=Image.open(f).convert("RGB")
    if im.width>w:
        im=im.resize((w,int(im.height*w/im.width)),Image.LANCZOS)
    im.save(os.path.join(TEX,out),quality=q,optimize=True)
    kb=os.path.getsize(os.path.join(TEX,out))//1024
    print(f"  {out:20} {im.size} {kb}KB")

# ---- build data.js bundle ----
def load_dir(d):
    out={}
    for f in sorted(glob.glob(os.path.join(ROOT,d,"*.json"))):
        out[os.path.basename(f)[:-5]]=json.load(open(f))
    return out
books=list(load_dir("data/books").values())
authors=load_dir("data/authors")
tax={
 "moods":json.load(open(os.path.join(ROOT,"data/taxonomies/moods.json")))["moods"],
 "genres":json.load(open(os.path.join(ROOT,"data/taxonomies/genres.json")))["genres"],
 "facets":json.load(open(os.path.join(ROOT,"data/taxonomies/facets.json"))),
}
org=[]
try: org=json.load(open(os.path.join(ROOT,"data/organization.json")))
except Exception: pass
bundle={"version":int(time.time()),"books":books,"authors":authors,"taxonomies":tax,"organization":org}
js="window.LIBRARY = "+json.dumps(bundle,ensure_ascii=False)+";\n"
open(os.path.join(ROOT,"data.js"),"w").write(js)
print(f"\ndata.js: {len(books)} books, {len(authors)} authors, {len(js)//1024}KB")
