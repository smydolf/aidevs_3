/**
 * Utility for normalizing Polish characters to ASCII equivalents
 */
export class PolishNormalizer {
    private static readonly POLISH_TO_ASCII: Record<string, string> = {
        // Lowercase
        'ą': 'a',
        'ć': 'c',
        'ę': 'e',
        'ł': 'l',
        'ń': 'n',
        'ó': 'o',
        'ś': 's',
        'ź': 'z',
        'ż': 'z',
        
        // Uppercase
        'Ą': 'A',
        'Ć': 'C',
        'Ę': 'E',
        'Ł': 'L',
        'Ń': 'N',
        'Ó': 'O',
        'Ś': 'S',
        'Ź': 'Z',
        'Ż': 'Z'
    };

    /**
     * Replace Polish letters with ASCII equivalents
     */
    static normalize(text: string): string {
        return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => {
            return this.POLISH_TO_ASCII[char] || char;
        });
    }
}

/**
 * Extension method for strings
 */
declare global {
    interface String {
        normalizePolish(): string;
    }
}

// Extend String prototype
String.prototype.normalizePolish = function(): string {
    return PolishNormalizer.normalize(String(this));
};

export default PolishNormalizer; 