import json, math
from PIL import Image, ImageChops
import comp
A='/Users/bto/orca/workspaces/Starfall/rework-polish/art/player/'
sheet=Image.open(A+'export/astronaut.png').convert('RGBA')
flame=Image.open(A+'export/astronaut_flame.png').convert('RGBA')
atlas=json.load(open(A+'export/astronaut.json'))
fr=atlas['frames']; fr=fr if isinstance(fr,list) else list(fr.values())
tags=atlas['meta']['frameTags']
meta=json.load(open('meta.json'))['frames']
def cell(img,i):
    r=fr[i]['frame']; return img.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h']))
# 1. exported vs local render
bad=0
for i in range(30):
    L={l:Image.open(f'frames/{l}_{i+1:02d}.png').convert('RGBA') for l in ['leg-far','arm-far','leg-near','arm-near']}
    loc=comp.compose(L,meta[i]['dy'],None,bg=False)
    d=ImageChops.difference(loc,cell(sheet,i)); n=sum(1 for p in d.getdata() if p!=(0,0,0,0))
    if n: bad+=1; print('frame',i+1,'differs',n)
print('export matches local render on', 30-bad, 'of 30 frames')
# 2. ground line on run + land
for t in tags:
    if t['name'] in ('run','land'):
        print(t['name'],'lowest opaque row per frame:',[cell(sheet,i).getbbox()[3]-1 for i in range(t['from'],t['to']+1)])
# 3. thrust vs fall first frames
th=cell(sheet,tags[0]['from']); fa=cell(sheet,[t for t in tags if t['name']=='fall'][0]['from'])
a=[p[3]>0 for p in th.getdata()]; b=[p[3]>0 for p in fa.getdata()]
print('silhouette pixels: thrust',sum(a),'fall',sum(b),'differ (XOR)',sum(x!=y for x,y in zip(a,b)))
tj=meta[tags[0]['from']]['joints']; fj=meta[[t for t in tags if t['name']=='fall'][0]['from']]['joints']
for l,k,lab in (('arm-near','tip','near hand'),('arm-far','tip','far hand'),('leg-near','toe','near foot'),('leg-far','toe','far foot')):
    print(f'{lab}: thrust {tj[l][k]} fall {fj[l][k]} distance {math.dist(tj[l][k],fj[l][k]):.1f}px')
# 4. GIFs from the tool-exported sheets
BG=(20,16,32,255)
def composed(i, withflame):
    c=Image.new('RGBA',(96,176),BG)
    if withflame: c.alpha_composite(cell(flame,i))
    c.alpha_composite(cell(sheet,i)); return c
for t in tags:
    ims=[composed(i,True).convert('RGB').resize((288,528),Image.NEAREST) for i in range(t['from'],t['to']+1)]
    durs=[fr[i]['duration'] for i in range(t['from'],t['to']+1)]
    loop=0 if t['name'] in ('thrust','fall','run','tumble') else None
    kw={'loop':0} if loop==0 else {}
    ims[0].save(A+f"previews/{t['name']}.gif",save_all=True,append_images=ims[1:],duration=durs,disposal=1,**kw)
# 5. poses.png: first frame of every tag. Row 1: half size (48x88) at 1x. Row 2: the same row at 3x,
# i.e. each frame drawn to 144x264 device pixels with smoothing, as the 960x600 canvas at 3x would show it.
firsts=[composed(t['from'],True) for t in tags]
names=[t['name'] for t in tags]
def row(size, gap):
    r=Image.new('RGBA',(len(firsts)*size[0]+(len(firsts)+1)*gap,size[1]+2*gap),BG)
    for k,f in enumerate(firsts): r.alpha_composite(f.resize(size,Image.LANCZOS),(gap+k*(size[0]+gap),gap))
    return r
r1=row((48,88),8); r3=row((144,264),24)
out=Image.new('RGBA',(r3.width,r1.height+r3.height),BG)
out.alpha_composite(r1,(0,0)); out.alpha_composite(r3,(0,r1.height))
out.convert('RGB').save(A+'previews/poses.png')
print('tags', names, 'poses.png', out.size)
