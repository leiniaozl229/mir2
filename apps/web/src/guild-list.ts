/** Scroll the legacy guild text list by the same three rows as its native up/down buttons. */
export function scrollGuildMemberList(list:HTMLOListElement,direction:-1|1,rows=3,lineHeight=14){
 const renderedHeight=list.querySelector<HTMLElement>('li')?.getBoundingClientRect().height??lineHeight;
 const stride=Math.max(1,renderedHeight)*Math.max(1,Math.floor(rows));
 const maxScroll=Math.max(0,list.scrollHeight-list.clientHeight);
 list.scrollTop=Math.max(0,Math.min(maxScroll,list.scrollTop+direction*stride));
 return list.scrollTop;
}
