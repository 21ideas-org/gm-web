// Original Bitboy symbol, including its built-in 14° clockwise rotation.
// Source: https://bitcoin.design/assets/images/guide/getting-started/visual-language/bitcoin-symbol.svg
// The sun and its eight rays follow the original favicon_io sun mark.
const bitcoin = "M48.3110008,84.375c-.3920021.9720001-1.3850021,2.4309998-3.6210022,1.8769989.0790024.1139984-5.7449989-1.4329987-5.7449989-1.4329987l-3.9199982,9.0410004,10.2799988,2.5629959c1.9109993.4790039,3.7879982.9790039,5.632,1.4530029l-3.2670021,13.1269989,7.8910027,1.9690018,3.2369995-12.9869995c2.1580009.5839996,4.25,1.125,6.2980003,1.6340027l-3.2260017,12.9259949,7.8999977,1.9690018,3.2700043-13.1019974c13.4729996,2.5479965,23.6039963,1.5199966,27.8659973-10.663002,3.4370041-9.8099976-.1699982-15.4690018-7.2579956-19.1600037,5.1609955-1.1899948,9.0509949-4.5859985,10.0879974-11.5979958,1.4329987-9.5820007-5.862999-14.7310028-15.8379974-18.1669998l3.2350006-12.9780006-7.8990021-1.9689999-3.151001,12.6359997c-2.0790024-.5180016-4.2099991-1.0060005-6.3310013-1.4890022l3.1709976-12.7199974-7.8939972-1.9690018-3.2389984,12.9760017-15.9309998-3.9459991-2.1020012,8.4369965s5.8610001,1.3430023,5.7369995,1.427002c3.2000008.7989998,3.7770004,2.9160004,3.6809998,4.5940018l-8.8639984,35.5519981ZM85.6869965,87.302002c-2.4440002,9.810997-18.9599991,4.5069962-24.317997,3.1759949l4.3380013-17.3889999c5.3549957,1.3350067,22.5299988,3.9810028,19.9799957,14.2130051ZM88.1269989,61.8499985c-2.2259979,8.9240036-15.9749985,4.3889999-20.4349976,3.2770004l3.9319992-15.7719994c4.4589996,1.1119995,18.8239975,3.1870003,16.5029984,12.4949989Z";

export { bitcoin as bitcoinSymbolPath };

/** Two print treatments of the existing sun identity. No text or surrounding badge.
 * @param {'ink' | 'engraved'} [variant]
 * @param {string} [id] Unique prefix when showing several marks together.
 */
export function sunStampSvg(variant = 'ink', id = `sun-${variant}`) {
  const engraved = variant === 'engraved';
  const symbol = `<path d="${bitcoin}" transform="translate(26.5 26.39757) scale(.4097222)" />`;
  const rays = Array.from({ length: 8 }, (_, i) => `<rect x="52.8" y="5.5" width="6.4" height="14" rx=".35" transform="rotate(${i * 45} 56 56)" />`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ink-stamp sun-stamp" viewBox="0 0 112 112" aria-hidden="true" focusable="false">
  <defs>
    <filter id="${id}-wear" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="${engraved ? '.26 .2' : '.19 .29'}" numOctaves="3" seed="21" result="grain" />
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${engraved ? '5.5 0 0 0 -.7' : '5 0 0 0 -.65'}" result="wear" />
      <feComposite in="SourceGraphic" in2="wear" operator="in" result="print" />
      <feDisplacementMap in="print" in2="grain" scale="${engraved ? '.3' : '.6'}" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="112" height="112" style="mask-type:luminance">
      <rect width="112" height="112" fill="white" />
      <g fill="black" ${engraved ? 'stroke="black" stroke-width="6" stroke-linejoin="round"' : ''}>${symbol}</g>
    </mask>
    ${!engraved ? `<mask id="${id}-protected" maskUnits="userSpaceOnUse" x="0" y="0" width="112" height="112" style="mask-type:luminance"><rect width="112" height="112" fill="black" /><g fill="white" stroke="white" stroke-width="8" stroke-linejoin="round">${symbol}</g></mask>` : ''}
    ${engraved ? `<pattern id="${id}-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0V4" stroke="currentColor" stroke-width=".55" /></pattern>` : ''}
  </defs>
  <g fill="currentColor">
    ${engraved ? `<g filter="url(#${id}-wear)"><g fill="none" stroke="currentColor" stroke-width="1.6">${rays}<circle cx="56" cy="56" r="29.5" /><circle cx="56" cy="56" r="26" stroke-width=".65" /></g>
    <circle cx="56" cy="56" r="25" fill="url(#${id}-hatch)" mask="url(#${id}-cut)" />
    </g>${symbol}` : `<g mask="url(#${id}-cut)"><g filter="url(#${id}-wear)">${rays}<circle cx="56" cy="56" r="29.5" /></g><circle cx="56" cy="56" r="29.5" mask="url(#${id}-protected)" /></g>`}
  </g>
</svg>`;
}
