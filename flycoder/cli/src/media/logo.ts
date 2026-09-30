import {artFromCharGrid,type PixelArt} from '../tui/pixels';
export async function loadLogo():Promise<{art:PixelArt|null;source:string}>{
 return {source:'fly',art:artFromCharGrid([
 '.....D.......D.....','......D.....D......','..WW...DDDDD...WW..','.WWWW.DDDDDDD.WWWW.',
 'WWWWW.DYYDYYD.WWWWW','.WWWW.DYW DYW.WWWW.'.replace(/ /g,'D'), '..WWW.DYYDYYD.WWW..',
 '...WW..DDDDD..WW...','......DDDDDDD......','....D.DDBBBDD.D....','...D..DDBBBDD..D...',
 '..D....DDDDD....D..','.......D.D.D.......','......D..D..D......'
 ],{D:'#6c7b8b',W:'#a7d8eb',Y:'#edc76a',B:'#344554'})};
}
