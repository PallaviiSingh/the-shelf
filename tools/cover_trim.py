# -*- coding: utf-8 -*-
# Shared white-margin trim logic (near-white backgrounds only; leaves coloured full-bleed covers alone).
from PIL import Image

def corner_bg(px,w,h,s=10):
    cs=[]
    for (x0,y0) in [(0,0),(w-s,0),(0,h-s),(w-s,h-s)]:
        acc=[0,0,0];n=0
        for yy in range(y0,y0+s):
            for xx in range(x0,x0+s):
                r,g,b=px[xx,yy];acc[0]+=r;acc[1]+=g;acc[2]+=b;n+=1
        cs.append((acc[0]//n,acc[1]//n,acc[2]//n))
    mx=0
    for i in range(4):
        for j in range(i+1,4):
            mx=max(mx,max(abs(cs[i][k]-cs[j][k]) for k in range(3)))
    bg=(sum(c[0] for c in cs)//4,sum(c[1] for c in cs)//4,sum(c[2] for c in cs)//4)
    return bg,mx

def white_trim_box(im,tol=22,frac=0.985):
    """Return (l,t,r,b) crop box trimming near-white uniform margins, or None to leave as-is."""
    im=im.convert("RGB");w,h=im.size;px=im.load()
    bg,cu=corner_bg(px,w,h)
    if not (bg[0]>=238 and bg[1]>=238 and bg[2]>=238): return None   # white bg only
    if cu>18: return None                                             # corners must be uniform
    def isbg(p): return abs(p[0]-bg[0])<=tol and abs(p[1]-bg[1])<=tol and abs(p[2]-bg[2])<=tol
    xs=list(range(0,w,max(1,w//220))); ys=list(range(0,h,max(1,h//220)))
    def row_bg(y):
        c=sum(1 for x in xs if isbg(px[x,y]));return c/len(xs)
    def col_bg(x):
        c=sum(1 for y in ys if isbg(px[x,y]));return c/len(ys)
    t=0
    while t<h-1 and row_bg(t)>=frac: t+=1
    b=h-1
    while b>t and row_bg(b)>=frac: b-=1
    l=0
    while l<w-1 and col_bg(l)>=frac: l+=1
    r=w-1
    while r>l and col_bg(r)>=frac: r-=1
    r+=1;b+=1
    tw,th=r-l,b-t
    if tw<=0 or th<=0: return None
    if (tw*th)/(w*h) < 0.40: return None                # would nuke the image → skip
    if (tw*th)/(w*h) > 0.992: return None               # nothing meaningful to trim
    # trim flush to the artwork (frac<1 already stops at the first non-white row, so no shaving)
    return (l,t,r,b)
